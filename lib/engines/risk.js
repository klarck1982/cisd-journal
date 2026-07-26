const { tradingDayKey, DEFAULT_TIMEZONE } = require('../trading-day');

function toNumber(value) {
  return Number(value) || 0;
}

/**
 * Resolves the trading day a trade belongs to.
 *
 * This used to be `String(value).slice(0, 10)` — a blind textual cut of a UTC
 * timestamp — while `today` was computed with tradingDayKey() in the account's
 * timezone. Comparing the two meant every trade closed after ~20:00 New York
 * carried the *next* UTC date and silently dropped out of the daily-loss total,
 * so the guard reported budget the trader had already spent.
 *
 * A plain "YYYY-MM-DD" (hand-entered trades) is already a trading day and is
 * returned untouched; converting it would shift it by a day.
 */
function dayKey(value, timezone) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return tradingDayKey(raw, timezone);
}

function tradePnl(trade) {
  if (trade.netProfit !== null && trade.netProfit !== undefined && trade.netProfit !== '') return toNumber(trade.netProfit);
  if (trade.profit !== null && trade.profit !== undefined && trade.profit !== '') return toNumber(trade.profit);
  return 0;
}

/**
 * Peak balance ("high-water mark") reached by the account.
 * Most prop firms measure maximum drawdown from the highest balance/equity the account
 * has ever reached, not from the starting capital. We prefer values synced from the firm
 * dashboard when available, then fall back to reconstructing the peak from closed trades.
 */
function resolvePeakBalance(account, trades, capital, balance) {
  const syncedPeak = Math.max(toNumber(account.syncedBalanceMax), toNumber(account.syncedEquityMax));
  if (syncedPeak > 0) return Math.max(syncedPeak, capital, balance);

  const ordered = trades
    .slice()
    .sort((a, b) => String(a.date || a.closeTime || a.createdAt || '').localeCompare(String(b.date || b.closeTime || b.createdAt || '')));

  const netTotal = ordered.reduce((sum, trade) => sum + tradePnl(trade), 0);
  // Walk the equity curve backwards from the current balance to find its highest point.
  let running = balance - netTotal;
  let peak = Math.max(capital, running);
  for (const trade of ordered) {
    running += tradePnl(trade);
    if (running > peak) peak = running;
  }
  return Math.max(peak, capital, balance);
}

function tradeOutcome(trade) {
  if (trade.resultR !== null && trade.resultR !== undefined && trade.resultR !== '') return toNumber(trade.resultR);
  return tradePnl(trade);
}

function buildRiskSnapshot(data, accountId, options = {}) {
  const account = (data.accounts || []).find((item) => item.id === accountId);
  if (!account) throw new Error('Account not found');

  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const today = options.today || tradingDayKey(options.now, timezone);
  const trades = (data.trades || []).filter((trade) => trade.accountId === accountId);
  const openPositions = (data.openPositions || []).filter((position) => position.accountId === accountId);

  const todayClosedPnl = trades
    .filter((trade) => dayKey(trade.date || trade.closeTime || trade.createdAt, timezone) === today)
    .reduce((sum, trade) => sum + tradePnl(trade), 0);
  const openPnl = openPositions.reduce((sum, position) => sum + toNumber(position.netProfit), 0);

  const capital = toNumber(account.capital);
  const balance = toNumber(account.currentBalance);
  const profitTargetPct = toNumber(account.profitTarget);
  const dailyLossPct = toNumber(account.dailyLoss);
  const maxDrawdownPct = toNumber(account.maxDrawdown);

  const dailyLossLimit = capital && dailyLossPct ? (capital * dailyLossPct) / 100 : null;
  const drawdownLimit = capital && maxDrawdownPct ? (capital * maxDrawdownPct) / 100 : null;
  const targetAmount = capital && profitTargetPct ? (capital * profitTargetPct) / 100 : null;

  const dailyLossUsed = Math.max(0, -todayClosedPnl);
  const dailyLossRemaining = dailyLossLimit === null ? null : dailyLossLimit - dailyLossUsed;

  const peakBalance = resolvePeakBalance(account, trades, capital, balance);
  const currentDrawdown = Math.max(0, peakBalance - balance);
  const drawdownRemaining = drawdownLimit === null ? null : drawdownLimit - currentDrawdown;

  const challengeGain = balance - capital;
  const challengeProgress = targetAmount && targetAmount > 0 ? challengeGain / targetAmount : null;
  const challengeProgressClamped = challengeProgress === null ? null : Math.max(0, Math.min(1, challengeProgress));
  const challengeRemaining = targetAmount === null ? null : Math.max(0, targetAmount - challengeGain);

  const sortedTrades = trades
    .slice()
    .sort((a, b) => String(a.date || a.closeTime || a.createdAt || '').localeCompare(String(b.date || b.closeTime || b.createdAt || '')));

  let consecutiveLosses = 0;
  for (let index = sortedTrades.length - 1; index >= 0; index--) {
    const outcome = tradeOutcome(sortedTrades[index]);
    if (outcome < 0) consecutiveLosses++;
    else break;
  }

  const warnings = [];
  if (consecutiveLosses >= 2) warnings.push({ code: 'CONSECUTIVE_LOSSES', severity: 'warn', value: consecutiveLosses });
  if (dailyLossRemaining !== null && dailyLossRemaining < 0) warnings.push({ code: 'DAILY_LOSS_LIMIT_BREACHED', severity: 'critical', remaining: dailyLossRemaining, limit: dailyLossLimit });
  else if (dailyLossRemaining !== null && dailyLossLimit > 0 && dailyLossRemaining <= dailyLossLimit * 0.25) warnings.push({ code: 'NEAR_DAILY_LOSS_LIMIT', severity: 'warn', remaining: dailyLossRemaining, limit: dailyLossLimit });
  if (drawdownRemaining !== null && drawdownRemaining < 0) warnings.push({ code: 'MAX_DRAWDOWN_BREACHED', severity: 'critical', remaining: drawdownRemaining, limit: drawdownLimit });
  else if (drawdownRemaining !== null && drawdownLimit > 0 && drawdownRemaining <= drawdownLimit * 0.25) warnings.push({ code: 'NEAR_MAX_DRAWDOWN', severity: 'warn', remaining: drawdownRemaining, limit: drawdownLimit });

  const state = warnings.some((item) => item.severity === 'critical')
    ? 'BREACH'
    : warnings.length
      ? 'ATTENTION'
      : 'SAFE';

  return {
    accountId,
    today,
    state,
    balances: {
      capital,
      balance,
      equity: balance + openPnl,
      openPnl,
      todayClosedPnl,
    },
    challenge: {
      targetAmount,
      challengeGain,
      challengeRemaining,
      progress: challengeProgress,
      progressClamped: challengeProgressClamped,
    },
    limits: {
      dailyLossPct,
      dailyLossLimit,
      dailyLossUsed,
      dailyLossRemaining,
      maxDrawdownPct,
      drawdownLimit,
      currentDrawdown,
      drawdownRemaining,
      peakBalance,
    },
    streaks: {
      consecutiveLosses,
    },
    openPositions: {
      count: openPositions.length,
    },
    warnings,
  };
}

module.exports = {
  buildRiskSnapshot,
  tradePnl,
  tradeOutcome,
};
