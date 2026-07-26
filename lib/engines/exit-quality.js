/**
 * Exit Quality Engine — did the trade capture the plan it was given?
 *
 * A note on scope, because honesty matters more than an impressive-sounding metric:
 *
 * True MFE/MAE (maximum favourable/adverse excursion) requires tick or bar data for the
 * life of every trade. The MT5 read-only bridge returns account info, positions and
 * deals — not price history — so that data genuinely does not exist here. Inventing it
 * would produce confident numbers with nothing behind them.
 *
 * What every trade *does* carry is entry, stop-loss, take-profit and close. That is
 * enough to answer the behavioural question traders actually care about:
 *
 *   "I keep cutting winners early" — is that true, and what has it cost?
 *
 * Planned R is the reward-to-risk the trader set at entry. Captured R is what they took.
 * The ratio between them is target capture, and its shortfall is a real, earned number.
 */

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isSell(side) {
  return /^(sell|short)$/i.test(String(side || '').trim());
}

/**
 * Reward-to-risk the trade was set up for, from its own stop and target.
 * Returns null when either level is missing — a trade without a target had no plan to
 * capture, and counting it would drag the average toward a meaningless number.
 */
function plannedR(trade) {
  const entry = toNumber(trade.entry);
  const stop = toNumber(trade.sl);
  const target = toNumber(trade.tp);
  if (entry === null || stop === null || target === null) return null;
  if (!entry || !stop || !target) return null;

  const risk = Math.abs(entry - stop);
  if (risk === 0) return null;

  const rawReward = target - entry;
  const reward = isSell(trade.side) ? -rawReward : rawReward;
  if (reward <= 0) return null; // target on the wrong side of entry: bad data, not a plan

  const planned = reward / risk;
  return planned > 100 ? null : round(planned);
}

/**
 * R actually captured. Prefers a real R, derived or manual, since both come from price.
 */
function capturedR(trade) {
  const value = toNumber(trade.resultR);
  return value === null ? null : value;
}

const TOLERANCE = 0.1; // R either side of target counts as "hit"

function classifyExit(trade) {
  const planned = plannedR(trade);
  const captured = capturedR(trade);
  if (planned === null || captured === null) return { classified: false, planned, captured, type: 'unknown' };

  // A loss is judged against the stop, not the target.
  if (captured <= -1 + TOLERANCE) return { classified: true, planned, captured, type: 'stopped' };
  if (captured < 0) return { classified: true, planned, captured, type: 'smallLoss' };
  if (captured >= planned - TOLERANCE) {
    return { classified: true, planned, captured, type: captured > planned + TOLERANCE ? 'beyondTarget' : 'target' };
  }
  if (captured <= TOLERANCE) return { classified: true, planned, captured, type: 'breakeven' };
  return { classified: true, planned, captured, type: 'early' };
}

function summarize(values) {
  if (!values.length) return { count: 0, total: 0, average: 0 };
  const total = values.reduce((sum, value) => sum + value, 0);
  return { count: values.length, total: round(total), average: round(total / values.length) };
}

function buildExitQualitySnapshot(data, accountId, options = {}) {
  const trades = (data.trades || []).filter((trade) => trade.accountId === accountId);

  const buckets = {
    target: [],
    beyondTarget: [],
    early: [],
    breakeven: [],
    smallLoss: [],
    stopped: [],
  };

  let classified = 0;
  let plannedTotal = 0;
  let capturedTotal = 0;
  const shortfalls = [];
  const earlyExits = [];

  for (const trade of trades) {
    const exit = classifyExit(trade);
    if (!exit.classified) continue;
    classified++;
    buckets[exit.type]?.push(exit.captured);

    // Only winners can leave target on the table; a stopped-out trade had no upside left.
    if (exit.captured > 0) {
      plannedTotal += exit.planned;
      capturedTotal += exit.captured;
      const shortfall = exit.planned - exit.captured;
      if (shortfall > TOLERANCE) {
        shortfalls.push(shortfall);
        earlyExits.push({
          id: trade.id,
          symbol: trade.symbol || '',
          date: trade.date || trade.closeTime || '',
          planned: exit.planned,
          captured: exit.captured,
          shortfall: round(shortfall),
        });
      }
    }
  }

  const winners = buckets.target.length + buckets.beyondTarget.length + buckets.early.length;
  const targetCapture = plannedTotal > 0 ? round(capturedTotal / plannedTotal, 4) : null;
  const shortfallStats = summarize(shortfalls);

  // Only claim a habit once there is enough evidence.
  const hasEvidence = classified >= 5 && winners >= 3;
  const cutsWinnersEarly = hasEvidence && buckets.early.length > buckets.target.length + buckets.beyondTarget.length;

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    totals: {
      trades: trades.length,
      classified,
      unclassified: trades.length - classified,
      winners,
    },
    // How much of the planned reward the trader actually took, across all winners.
    targetCapture,
    plannedR: round(plannedTotal),
    capturedR: round(capturedTotal),
    // The headline: R left on the table by exiting before target.
    leftOnTable: shortfallStats.total,
    averageShortfall: shortfallStats.average,
    breakdown: {
      target: buckets.target.length,
      beyondTarget: buckets.beyondTarget.length,
      early: buckets.early.length,
      breakeven: buckets.breakeven.length,
      smallLoss: buckets.smallLoss.length,
      stopped: buckets.stopped.length,
    },
    hasEvidence,
    cutsWinnersEarly,
    worstExits: earlyExits.sort((a, b) => b.shortfall - a.shortfall).slice(0, 5),
  };
}

module.exports = {
  plannedR,
  classifyExit,
  buildExitQualitySnapshot,
};
