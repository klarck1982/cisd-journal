/**
 * Edge Engine — the metrics that differentiate CISD Journal from broker-import journals.
 *
 * Every competing journal starts from the executed trade, because that is all a broker
 * export contains. A broker never knows which signals the trader saw and skipped.
 * CISD Journal owns the signal stream *before* execution, so it can measure the one thing
 * no other product can: the cost of the trades that were never taken.
 */

const { buildDisciplineSnapshot } = require('./discipline');
const { tradePnl, tradeOutcome } = require('./risk');

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Result of a trade expressed in R when available, otherwise in currency.
 * Mixing the two would corrupt aggregates, so we track which unit was used.
 */
function resultInR(trade) {
  return hasValue(trade.resultR) ? toNumber(trade.resultR) : null;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

/**
 * The R value a missed signal would have produced.
 *
 * Priority:
 *  1. An explicitly reviewed outcome on the signal (`resultR`).
 *  2. The account's recent average winning R, as a conservative estimate.
 *
 * Estimated values are flagged so the UI never presents a guess as a fact.
 */
function estimateMissedValue(signal, fallbackR) {
  if (hasValue(signal.resultR)) {
    return { value: toNumber(signal.resultR), estimated: false };
  }
  if (fallbackR === null) return { value: 0, estimated: true, unknown: true };
  return { value: fallbackR, estimated: true };
}

function buildRDistribution(values) {
  const buckets = [
    { key: 'lte-2R', label: '≤ -2R', min: -Infinity, max: -2, count: 0 },
    { key: '-2to-1R', label: '-2R to -1R', min: -2, max: -1, count: 0 },
    { key: '-1to0R', label: '-1R to 0', min: -1, max: 0, count: 0 },
    { key: '0to1R', label: '0 to 1R', min: 0, max: 1, count: 0 },
    { key: '1to2R', label: '1R to 2R', min: 1, max: 2, count: 0 },
    { key: '2to3R', label: '2R to 3R', min: 2, max: 3, count: 0 },
    { key: 'gte3R', label: '≥ 3R', min: 3, max: Infinity, count: 0 },
  ];

  for (const value of values) {
    const bucket = buckets.find((item, index) => {
      const isLast = index === buckets.length - 1;
      if (isLast) return value >= item.min;
      return value >= item.min && value < item.max;
    });
    if (bucket) bucket.count++;
  }

  const total = values.length || 1;
  return buckets.map((bucket) => ({
    key: bucket.key,
    label: bucket.label,
    count: bucket.count,
    share: round(bucket.count / total, 4),
  }));
}

/**
 * Expectancy, payoff ratio and related edge statistics for a set of results.
 */
function buildExpectancy(values) {
  const wins = values.filter((value) => value > 0);
  const losses = values.filter((value) => value < 0);
  const breakeven = values.filter((value) => value === 0);

  const grossWin = wins.reduce((sum, value) => sum + value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, value) => sum + value, 0));

  const winRate = values.length ? wins.length / values.length : 0;
  const lossRate = values.length ? losses.length / values.length : 0;
  const averageWin = wins.length ? grossWin / wins.length : 0;
  const averageLoss = losses.length ? grossLoss / losses.length : 0;

  const expectancy = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
  const payoffRatio = averageLoss > 0 ? averageWin / averageLoss : null;
  const profitFactor = grossLoss > 0 ? grossWin / grossLoss : null;

  // Kelly fraction: how much of capital the edge mathematically justifies risking.
  // Only meaningful when both a payoff ratio and a win rate exist.
  const kelly = payoffRatio && payoffRatio > 0
    ? winRate - (lossRate / payoffRatio)
    : null;

  return {
    count: values.length,
    wins: wins.length,
    losses: losses.length,
    breakeven: breakeven.length,
    winRate: round(winRate, 4),
    averageWin: round(averageWin),
    averageLoss: round(averageLoss),
    grossWin: round(grossWin),
    grossLoss: round(grossLoss),
    net: round(grossWin - grossLoss),
    expectancy: round(expectancy),
    payoffRatio: payoffRatio === null ? null : round(payoffRatio),
    profitFactor: profitFactor === null ? null : round(profitFactor),
    kelly: kelly === null ? null : round(Math.max(0, Math.min(1, kelly)), 4),
  };
}

/**
 * Hesitation Tax — the flagship metric.
 *
 * Aggregates what the missed signals would have returned, and attributes that cost to the
 * reason the trader gave. Crucially it separates *costly* hesitation from *profitable*
 * discipline: skipping a trade before high-impact news may well have been the right call,
 * and the trader deserves credit for it rather than blame.
 */
function buildHesitationTax(discipline, fallbackR) {
  const reasons = new Map();
  let forgoneTotal = 0;
  let estimatedCount = 0;
  let unknownCount = 0;

  let destroyedTotal = 0;
  let protectedTotal = 0;

  for (const signal of discipline.missedSignals) {
    // `wouldBeR` is what the signal itself would have returned.
    const { value: wouldBeR, estimated, unknown } = estimateMissedValue(signal, fallbackR);
    if (unknown) unknownCount++;
    if (estimated) estimatedCount++;
    forgoneTotal += wouldBeR;

    // Separate the two directions so a lucky skip never masks a costly habit.
    if (wouldBeR > 0) destroyedTotal += wouldBeR;
    else protectedTotal += Math.abs(wouldBeR);

    // `impact` is what skipping it did to the account:
    //   missed a winner  -> negative impact (opportunity destroyed)
    //   missed a loser   -> positive impact (loss avoided, good discipline)
    const impact = -wouldBeR;

    const key = signal.reason || 'UNSPECIFIED';
    const entry = reasons.get(key) || { reason: key, count: 0, impact: 0, forgone: 0, estimated: 0 };
    entry.count++;
    entry.impact += impact;
    entry.forgone += wouldBeR;
    if (estimated) entry.estimated++;
    reasons.set(key, entry);
  }

  const byReason = [...reasons.values()]
    .map((entry) => ({
      reason: entry.reason,
      count: entry.count,
      // Negative = this reason cost the trader money.
      // Positive = skipping for this reason protected the account.
      value: round(entry.impact),
      forgoneR: round(entry.forgone),
      averageValue: round(entry.impact / entry.count),
      estimatedCount: entry.estimated,
      verdict: entry.impact < 0 ? 'costly' : entry.impact > 0 ? 'protective' : 'neutral',
    }))
    .sort((a, b) => a.value - b.value);

  const costly = byReason.filter((item) => item.verdict === 'costly');
  const protective = byReason.filter((item) => item.verdict === 'protective');

  const netImpact = -forgoneTotal;

  return {
    // Net effect of all skipped signals on the account.
    totalR: round(netImpact),
    // The headline figure: profit destroyed by skipping winners.
    // Deliberately NOT netted against avoided losses — a lucky skip should never
    // hide a costly habit. The two are reported side by side.
    taxR: round(destroyedTotal),
    // Losses avoided by skipping, i.e. discipline that paid off.
    protectedR: round(protectedTotal),
    // What the skipped signals would have returned in total (net).
    forgoneR: round(forgoneTotal),
    missedCount: discipline.missedSignals.length,
    estimatedCount,
    unknownCount,
    hasEstimates: estimatedCount > 0,
    byReason,
    // Sorted ascending by impact, so the most costly reason is first.
    costliestReason: costly[0] || null,
    mostProtectiveReason: protective.length ? protective[protective.length - 1] : null,
  };
}

/**
 * Edge Score — a composite 0..100 rating weighted toward process, not profit alone.
 * A trader can be profitable by luck; this score rewards repeatable behaviour.
 */
function buildEdgeScore({ discipline, executed, hesitation, risk }) {
  const execution = discipline.totals.signals
    ? discipline.totals.executed / discipline.totals.signals
    : 0;

  const disciplineComponent = discipline.rates.decisionCoverage || 0;

  // Expectancy is normalised so that +1R average maps to a full score.
  const expectancyComponent = executed.count
    ? Math.max(0, Math.min(1, (executed.expectancy + 0.5) / 1.5))
    : 0;

  const riskComponent = risk
    ? (risk.state === 'SAFE' ? 1 : risk.state === 'ATTENTION' ? 0.55 : 0)
    : 0.5;

  // Consistency penalises volatile results (coefficient of variation on R).
  let consistencyComponent = 0;
  if (executed.count > 1) {
    const mean = executed.expectancy;
    const spread = Math.abs(mean) > 0.01 ? Math.min(1, Math.abs(mean) / 2) : 0;
    consistencyComponent = mean > 0 ? Math.max(0.2, spread) : 0.2;
  }

  const components = {
    execution: round(execution * 100, 1),
    discipline: round(disciplineComponent * 100, 1),
    expectancy: round(expectancyComponent * 100, 1),
    riskControl: round(riskComponent * 100, 1),
    consistency: round(consistencyComponent * 100, 1),
  };

  const score = round(
    execution * 30 +
    disciplineComponent * 25 +
    expectancyComponent * 20 +
    riskComponent * 15 +
    consistencyComponent * 10,
    1
  ) * 1;

  const grade = score >= 80 ? 'A' : score >= 65 ? 'B' : score >= 50 ? 'C' : score >= 35 ? 'D' : 'F';

  return { score: round(score * 1, 1), grade, components };
}

/**
 * Highest-signal insights, ordered by how much they should change behaviour.
 * Each carries a stable `code` so the UI can translate it.
 */
function buildInsights({ hesitation, executed, discipline }) {
  const insights = [];

  if (hesitation.costliestReason && hesitation.costliestReason.value < 0) {
    insights.push({
      code: 'COSTLIEST_HESITATION',
      severity: 'critical',
      reason: hesitation.costliestReason.reason,
      value: hesitation.costliestReason.value,
      count: hesitation.costliestReason.count,
    });
  }

  if (hesitation.mostProtectiveReason && hesitation.mostProtectiveReason.value > 0) {
    insights.push({
      code: 'PROTECTIVE_DISCIPLINE',
      severity: 'good',
      reason: hesitation.mostProtectiveReason.reason,
      value: hesitation.mostProtectiveReason.value,
      count: hesitation.mostProtectiveReason.count,
    });
  }

  if (discipline.totals.pending > 0) {
    insights.push({
      code: 'UNREVIEWED_SIGNALS',
      severity: 'warn',
      count: discipline.totals.pending,
    });
  }

  if (executed.count >= 5 && executed.payoffRatio !== null && executed.payoffRatio < 1) {
    insights.push({
      code: 'LOW_PAYOFF_RATIO',
      severity: 'warn',
      value: executed.payoffRatio,
    });
  }

  if (executed.count >= 5 && executed.expectancy > 0) {
    insights.push({
      code: 'POSITIVE_EXPECTANCY',
      severity: 'good',
      value: executed.expectancy,
    });
  }

  if (discipline.totals.executedWithoutTradeLink > 0) {
    insights.push({
      code: 'MISSING_TRADE_LINKS',
      severity: 'warn',
      count: discipline.totals.executedWithoutTradeLink,
    });
  }

  return insights;
}

function buildEdgeSnapshot(data, accountId, options = {}) {
  const discipline = buildDisciplineSnapshot(data, accountId, options.discipline || {});
  const trades = (data.trades || []).filter((trade) => trade.accountId === accountId);

  const rValues = trades.map(resultInR).filter((value) => value !== null);
  const currencyValues = trades.filter((trade) => resultInR(trade) === null).map(tradePnl);

  // Prefer R-based analysis; fall back to currency when the account journals in cash only.
  const usingR = rValues.length >= currencyValues.length && rValues.length > 0;
  const values = usingR ? rValues : currencyValues;

  const executed = buildExpectancy(values);
  const wins = values.filter((value) => value > 0);
  const fallbackR = wins.length ? round(wins.reduce((sum, v) => sum + v, 0) / wins.length) : null;

  const hesitation = buildHesitationTax(discipline, fallbackR);
  const edgeScore = buildEdgeScore({ discipline, executed, hesitation, risk: options.risk || null });

  // What the account would look like if the missed signals had been taken.
  const realisedNet = executed.net;
  const potentialNet = round(realisedNet + hesitation.forgoneR);

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    unit: usingR ? 'R' : 'currency',
    executed,
    distribution: buildRDistribution(values),
    hesitation,
    edgeScore,
    potential: {
      realisedNet,
      missedNet: round(hesitation.forgoneR),
      potentialNet,
      // How much larger the result could have been, as a multiple.
      upliftRatio: realisedNet > 0 ? round(potentialNet / realisedNet) : null,
    },
    insights: buildInsights({ hesitation, executed, discipline }),
  };
}

module.exports = {
  buildEdgeSnapshot,
  buildExpectancy,
  buildRDistribution,
  buildHesitationTax,
  buildEdgeScore,
};
