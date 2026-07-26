function normalizeStatus(status) {
  return String(status || '').trim().toUpperCase();
}

const EXECUTED_STATUSES = new Set(['ORDER_PLACED', 'EXECUTED', 'ENTERED', 'FILLED', 'TAKEN']);
const MISSED_STATUSES = new Set(['MISSED', 'SKIPPED', 'NO_ENTRY']);

function isSignalInMode(signal, mode) {
  if (mode === 'ALL') return true;
  const signalMode = signal.mode || 'LIVE';
  return signalMode === mode;
}

function decisionForSignal(signal, accountId) {
  if ((signal.mode || 'LIVE') === 'BACKTEST') {
    const status = normalizeStatus(signal.status);
    if (!status || status === 'NEW') return null;
    if (status === 'MISSED') {
      return { status: 'MISSED', outcome: null, reason: signal.reviewNote || signal.reason || '', updatedAt: signal.reviewedAt || signal.importedAt || '' };
    }
    return { status: 'EXECUTED', outcome: status, reason: signal.reviewNote || signal.reason || '', updatedAt: signal.reviewedAt || signal.importedAt || '' };
  }
  return signal.decisions?.[accountId] || null;
}

function numericTradeResult(trade) {
  // A derived R is computed from price on import. Summing it alongside currency P&L
  // from other trades would mix units in the same total, so only a manually entered
  // R is treated as the authoritative result here.
  const hasManualR = trade.resultR !== null && trade.resultR !== undefined && trade.resultR !== ''
    && trade.resultRSource !== 'derived';
  if (hasManualR) return Number(trade.resultR) || 0;
  if (trade.netProfit !== null && trade.netProfit !== undefined && trade.netProfit !== '') return Number(trade.netProfit) || 0;
  if (trade.resultR !== null && trade.resultR !== undefined && trade.resultR !== '') return Number(trade.resultR) || 0;
  return 0;
}

function buildDisciplineSnapshot(data, accountId, options = {}) {
  const mode = options.mode || 'LIVE';
  const liveSignals = (data.signals || []).filter((signal) => isSignalInMode(signal, 'LIVE'));
  const backtestSignals = (data.backtestSignals || []).filter((signal) => isSignalInMode(signal, 'BACKTEST'));
  const signals = mode === 'BACKTEST' ? backtestSignals : mode === 'LIVE' ? liveSignals : [...liveSignals, ...backtestSignals];
  const trades = (data.trades || []).filter((trade) => trade.accountId === accountId);
  const linkedTrades = trades.filter((trade) => trade.signalId);
  const linkedTradeMap = new Map(linkedTrades.map((trade) => [trade.signalId, trade]));

  const snapshot = {
    accountId,
    mode,
    totals: {
      signals: signals.length,
      decided: 0,
      executed: 0,
      missed: 0,
      pending: 0,
      linkedTrades: linkedTrades.length,
      executedWithoutTradeLink: 0,
    },
    rates: {
      decisionCoverage: 0,
      executionRate: 0,
      missedRate: 0,
      linkRate: 0,
    },
    score: 0,
    reasons: [],
    missedSignals: [],
    executedSignals: [],
    pendingSignals: [],
    linkedPerformance: {
      count: 0,
      wins: 0,
      losses: 0,
      breakeven: 0,
      averageResult: 0,
      netResult: 0,
    },
  };

  const reasonMap = new Map();
  let linkedNet = 0;

  for (const signal of signals) {
    const decision = decisionForSignal(signal, accountId);
    const status = normalizeStatus(decision?.status);
    const linkedTrade = linkedTradeMap.get(signal.SignalID);

    if (!decision || !status || status === 'NEW') {
      snapshot.totals.pending++;
      snapshot.pendingSignals.push({
        signalId: signal.SignalID,
        instrument: signal.Instrument || '',
        direction: signal.Direction || '',
        timeframe: signal.TF || '',
        session: signal.Session || '',
        importedAt: signal.importedAt || '',
      });
      continue;
    }

    snapshot.totals.decided++;

    if (EXECUTED_STATUSES.has(status)) {
      snapshot.totals.executed++;
      if (!linkedTrade) snapshot.totals.executedWithoutTradeLink++;
      snapshot.executedSignals.push({
        signalId: signal.SignalID,
        instrument: signal.Instrument || '',
        direction: signal.Direction || '',
        timeframe: signal.TF || '',
        session: signal.Session || '',
        status,
        outcome: decision.outcome || null,
        updatedAt: decision.updatedAt || signal.importedAt || '',
        linkedTradeId: linkedTrade?.id || null,
      });
    } else if (MISSED_STATUSES.has(status)) {
      snapshot.totals.missed++;
      const normalizedReason = String(decision.reason || '').trim() || 'UNSPECIFIED';
      reasonMap.set(normalizedReason, (reasonMap.get(normalizedReason) || 0) + 1);
      snapshot.missedSignals.push({
        signalId: signal.SignalID,
        instrument: signal.Instrument || '',
        direction: signal.Direction || '',
        timeframe: signal.TF || '',
        session: signal.Session || '',
        reason: normalizedReason,
        updatedAt: decision.updatedAt || signal.importedAt || '',
        // Carried through so the edge engine can price the missed opportunity
        // instead of estimating it.
        resultR: signal.resultR ?? null,
      });
    } else {
      snapshot.totals.pending++;
      snapshot.pendingSignals.push({
        signalId: signal.SignalID,
        instrument: signal.Instrument || '',
        direction: signal.Direction || '',
        timeframe: signal.TF || '',
        session: signal.Session || '',
        importedAt: signal.importedAt || '',
      });
    }
  }

  snapshot.reasons = [...reasonMap.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));

  const linkedResults = linkedTrades.map((trade) => numericTradeResult(trade));
  linkedResults.forEach((value) => {
    linkedNet += value;
    if (value > 0) snapshot.linkedPerformance.wins++;
    else if (value < 0) snapshot.linkedPerformance.losses++;
    else snapshot.linkedPerformance.breakeven++;
  });

  snapshot.linkedPerformance.count = linkedTrades.length;
  snapshot.linkedPerformance.netResult = linkedNet;
  snapshot.linkedPerformance.averageResult = linkedTrades.length ? linkedNet / linkedTrades.length : 0;

  const totalSignals = snapshot.totals.signals || 0;
  const decided = snapshot.totals.decided || 0;
  const executed = snapshot.totals.executed || 0;
  const missed = snapshot.totals.missed || 0;
  const linkedCount = snapshot.linkedPerformance.count || 0;

  snapshot.rates.decisionCoverage = totalSignals ? decided / totalSignals : 0;
  snapshot.rates.executionRate = totalSignals ? executed / totalSignals : 0;
  snapshot.rates.missedRate = totalSignals ? missed / totalSignals : 0;
  snapshot.rates.linkRate = executed ? linkedCount / executed : 0;

  const completeness = totalSignals ? decided / totalSignals : 0;
  const executionConsistency = decided ? executed / decided : 0;
  const evidenceConsistency = executed ? Math.min(1, linkedCount / executed) : 0;
  snapshot.score = Math.round((completeness * 40 + executionConsistency * 35 + evidenceConsistency * 25) * 100) / 100;

  return snapshot;
}

module.exports = {
  buildDisciplineSnapshot,
  decisionForSignal,
  EXECUTED_STATUSES,
  MISSED_STATUSES,
};
