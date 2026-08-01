/**
 * Backtest factor attribution — "which filter combination carries the edge?"
 *
 * The indicator writes one column per optional filter with a tri-state value:
 *   '1' → the filter was ACTIVE and the signal PASSED it
 *   '0' → the filter was ACTIVE and the signal FAILED it
 *   '-' (or empty) → the filter was NOT enabled at signal time
 *
 * Plus Grade (Standard/Premium/Ultimate) and Score (passed/active, e.g. 2/2).
 *
 * This engine answers, per factor and per factor combination, how the manually
 * graded backtest outcomes (WIN/LOSS/BE with R) distribute — so the trader can
 * see, for example, that Trend+Fib+MomVol+Confirmed signals net +12R at 68%
 * while unfiltered ones hover near zero.
 */

const FACTOR_KEYS = ['Trend', 'Fib', 'MS', 'HTF', 'MomVol', 'Confirmed'];

const SCORED_STATUSES = new Set(['WIN', 'LOSS', 'BE']);

function factorValue(signal, key) {
  const raw = String(signal?.[key] ?? '').trim();
  if (raw === '1') return 'passed';
  if (raw === '0') return 'failed';
  return 'inactive';
}

function isScored(signal) {
  if (!SCORED_STATUSES.has(String(signal?.status || '').toUpperCase())) return false;
  const r = Number(signal?.resultR);
  return Number.isFinite(r);
}

function summarize(signals) {
  const scored = signals.filter(isScored);
  const wins = scored.filter((s) => String(s.status).toUpperCase() === 'WIN').length;
  const losses = scored.filter((s) => String(s.status).toUpperCase() === 'LOSS').length;
  const breakevens = scored.length - wins - losses;
  const netR = scored.reduce((sum, s) => sum + Number(s.resultR), 0);
  return {
    signals: signals.length,
    scored: scored.length,
    wins,
    losses,
    breakevens,
    winRate: scored.length ? wins / scored.length : null,
    netR: Math.round(netR * 100) / 100,
    avgR: scored.length ? Math.round((netR / scored.length) * 100) / 100 : null,
  };
}

/**
 * Per-factor breakdown: how signals that passed / failed / had the filter
 * inactive performed, for each of the six indicator filters.
 */
function buildFactorBreakdown(signals) {
  return FACTOR_KEYS.map((key) => {
    const passed = [];
    const failed = [];
    const inactive = [];
    for (const signal of signals || []) {
      const bucket = factorValue(signal, key);
      if (bucket === 'passed') passed.push(signal);
      else if (bucket === 'failed') failed.push(signal);
      else inactive.push(signal);
    }
    return {
      key,
      passed: summarize(passed),
      failed: summarize(failed),
      inactive: summarize(inactive),
    };
  });
}

/**
 * Outcome split for one chosen combination: signals passing ALL selected
 * factors versus everything else. This is the "best 4 conditions" lens.
 */
function evaluateCombination(signals, factorKeys = []) {
  const selected = factorKeys.filter((key) => FACTOR_KEYS.includes(key));
  if (!selected.length) return null;
  const matching = [];
  const others = [];
  for (const signal of signals || []) {
    const allPassed = selected.every((key) => factorValue(signal, key) === 'passed');
    (allPassed ? matching : others).push(signal);
  }
  return {
    factors: selected,
    matching: summarize(matching),
    others: summarize(others),
  };
}

/**
 * Auto-discovery: scan every combination of 2..4 factors and return the ones
 * with enough scored samples, ranked by average R. Keeps the UI answer-first.
 */
function findComboLeaders(signals, options = {}) {
  const minSamples = options.minSamples || 3;
  const limit = options.limit || 5;
  const leaders = [];

  const pick = (pool, size, start = 0, current = []) => {
    if (current.length === size) {
      leaders.push(current.slice());
      return;
    }
    for (let i = start; i < pool.length; i += 1) {
      current.push(pool[i]);
      pick(pool, size, i + 1, current);
      current.pop();
    }
  };

  for (const size of [2, 3, 4]) {
    pick(FACTOR_KEYS, size);
  }

  return leaders
    .map((factors) => evaluateCombination(signals, factors))
    .filter((combo) => combo && combo.matching.scored >= minSamples && combo.matching.avgR !== null)
    .sort((a, b) => b.matching.avgR - a.matching.avgR || b.matching.netR - a.matching.netR)
    .slice(0, limit);
}

/** Grade (Standard/Premium/Ultimate) and Score (2/2 …) outcome splits. */
function buildGradeBreakdown(signals) {
  const groups = new Map();
  for (const signal of signals || []) {
    const grade = String(signal.Grade || '').trim() || 'Unknown';
    if (!groups.has(grade)) groups.set(grade, []);
    groups.get(grade).push(signal);
  }
  return [...groups.entries()].map(([grade, group]) => ({ grade, ...summarize(group) }));
}

module.exports = {
  FACTOR_KEYS,
  factorValue,
  isScored,
  summarize,
  buildFactorBreakdown,
  evaluateCombination,
  findComboLeaders,
  buildGradeBreakdown,
};
