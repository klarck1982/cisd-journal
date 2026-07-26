/**
 * Playbook Engine — strategy definition and rule-adherence measurement.
 *
 * A Playbook is a named strategy with explicit rules. Trades and signals are linked to it,
 * and the engine answers three questions:
 *
 *   1. How often did the trader actually follow the rules?
 *   2. What is the performance difference between following and breaking them?
 *   3. Which qualifying signals were skipped, and what did that cost?
 *
 * Question 3 is the one no broker-import journal can answer, because a broker export only
 * contains executed trades. CISD Journal owns the signal stream, so a signal that matched
 * a playbook but was never taken is still visible and can be priced.
 */

const crypto = require('crypto');

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Result of a trade in R. A derived R (computed from price on import) is acceptable here
 * because playbook analysis is explicitly R-based; the unit never mixes with currency.
 */
function tradeResultR(trade) {
  if (hasValue(trade.resultR)) return toNumber(trade.resultR);
  return null;
}

function normalizeRule(rule, index) {
  if (typeof rule === 'string') {
    return { id: `r${index}`, text: rule.trim(), required: true };
  }
  return {
    id: rule.id || `r${index}`,
    text: String(rule.text || '').trim(),
    required: rule.required !== false,
  };
}

/**
 * Creates a playbook with a stable shape, so the rest of the engine can rely on it.
 */
function createPlaybook(payload = {}) {
  const rules = Array.isArray(payload.rules) ? payload.rules : [];
  return {
    id: payload.id || crypto.randomUUID(),
    accountId: payload.accountId || null,
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim(),
    rules: rules.map(normalizeRule).filter((rule) => rule.text),
    maxRiskPercent: toNumber(payload.maxRiskPercent),
    maxTradesPerDay: toNumber(payload.maxTradesPerDay),
    // Matching criteria used to detect qualifying signals the trader skipped.
    match: {
      session: String(payload.match?.session || payload.session || '').trim(),
      symbol: String(payload.match?.symbol || payload.symbol || '').trim().toUpperCase(),
      timeframe: String(payload.match?.timeframe || payload.tf || '').trim(),
      direction: String(payload.match?.direction || '').trim(),
    },
    archived: !!payload.archived,
    createdAt: payload.createdAt || new Date().toISOString(),
  };
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

/**
 * Does a signal qualify for this playbook?
 * Empty criteria act as wildcards, so a playbook with no filters matches everything.
 */
function signalMatchesPlaybook(signal, playbook) {
  const match = playbook.match || {};

  if (match.symbol && normalizeText(signal.Instrument) !== normalizeText(match.symbol)) return false;
  if (match.timeframe && normalizeText(signal.TF) !== normalizeText(match.timeframe)) return false;

  if (match.session) {
    const want = normalizeText(match.session);
    const got = normalizeText(signal.Session);
    if (!got.includes(want) && !want.includes(got)) return false;
  }

  if (match.direction) {
    const want = normalizeText(match.direction);
    const got = normalizeText(signal.Direction);
    if (!got.includes(want)) return false;
  }

  return true;
}

const EXECUTED = new Set(['ORDER_PLACED', 'EXECUTED', 'ENTERED', 'FILLED', 'TAKEN']);
const MISSED = new Set(['MISSED', 'SKIPPED', 'NO_ENTRY']);

function decisionStatus(signal, accountId) {
  return String(signal.decisions?.[accountId]?.status || '').trim().toUpperCase();
}

/**
 * A trade followed the playbook when every required rule was ticked.
 * `followedRules` is an array of rule ids recorded at journalling time.
 */
function evaluateAdherence(trade, playbook) {
  const required = playbook.rules.filter((rule) => rule.required);
  if (!required.length) {
    // With no rules defined we cannot judge adherence; treat it as unclassified
    // rather than silently counting it as compliant.
    return { classified: false, followed: false, followedCount: 0, requiredCount: 0, brokenRules: [] };
  }

  const ticked = new Set(Array.isArray(trade.followedRules) ? trade.followedRules : []);
  const brokenRules = required.filter((rule) => !ticked.has(rule.id));

  return {
    classified: Array.isArray(trade.followedRules),
    followed: brokenRules.length === 0,
    followedCount: required.length - brokenRules.length,
    requiredCount: required.length,
    brokenRules: brokenRules.map((rule) => ({ id: rule.id, text: rule.text })),
  };
}

function summarize(values) {
  if (!values.length) {
    return { count: 0, wins: 0, losses: 0, net: 0, average: 0, winRate: 0 };
  }
  const wins = values.filter((value) => value > 0).length;
  const losses = values.filter((value) => value < 0).length;
  const net = values.reduce((sum, value) => sum + value, 0);
  return {
    count: values.length,
    wins,
    losses,
    net: round(net),
    average: round(net / values.length),
    winRate: round(wins / values.length, 4),
  };
}

/**
 * Full report for one playbook.
 */
function buildPlaybookReport(data, playbook, accountId, options = {}) {
  const trades = (data.trades || []).filter(
    (trade) => trade.accountId === accountId && trade.playbookId === playbook.id
  );

  const followedValues = [];
  const brokenValues = [];
  const ruleBreaks = new Map();
  let classifiedCount = 0;

  for (const trade of trades) {
    const adherence = evaluateAdherence(trade, playbook);
    const result = tradeResultR(trade);
    if (adherence.classified) classifiedCount++;

    for (const rule of adherence.brokenRules) {
      const entry = ruleBreaks.get(rule.id) || { id: rule.id, text: rule.text, count: 0, cost: 0 };
      entry.count++;
      if (result !== null) entry.cost += result;
      ruleBreaks.set(rule.id, entry);
    }

    if (result === null) continue;
    if (adherence.followed) followedValues.push(result);
    else if (adherence.classified) brokenValues.push(result);
  }

  const followed = summarize(followedValues);
  const broken = summarize(brokenValues);

  // Signals that qualified for this playbook but were skipped.
  const liveSignals = (data.signals || []).filter((signal) => (signal.mode || 'LIVE') === 'LIVE');
  const qualifying = liveSignals.filter((signal) => signalMatchesPlaybook(signal, playbook));

  const missedSignals = qualifying.filter((signal) => MISSED.has(decisionStatus(signal, accountId)));
  const executedSignals = qualifying.filter((signal) => EXECUTED.has(decisionStatus(signal, accountId)));
  const pendingSignals = qualifying.filter((signal) => {
    const status = decisionStatus(signal, accountId);
    return !status || status === 'NEW';
  });

  // Price the skipped opportunities. Reviewed outcomes are used when present, otherwise
  // the playbook's own average winning trade is a conservative stand-in.
  const winningAverage = followedValues.filter((value) => value > 0);
  const fallbackR = winningAverage.length
    ? round(winningAverage.reduce((sum, value) => sum + value, 0) / winningAverage.length)
    : null;

  let missedValue = 0;
  let estimatedCount = 0;
  for (const signal of missedSignals) {
    if (hasValue(signal.resultR)) {
      missedValue += toNumber(signal.resultR);
    } else if (fallbackR !== null) {
      missedValue += fallbackR;
      estimatedCount++;
    }
  }

  const adherenceRate = classifiedCount
    ? round((followed.count + broken.count ? followed.count / (followed.count + broken.count) : 0), 4)
    : null;

  // The single most useful number: how much each rule break costs on average.
  const edgeGap = followed.count && broken.count
    ? round(followed.average - broken.average)
    : null;

  return {
    playbookId: playbook.id,
    name: playbook.name,
    accountId,
    totals: {
      trades: trades.length,
      classified: classifiedCount,
      unclassified: trades.length - classifiedCount,
    },
    adherenceRate,
    followed,
    broken,
    edgeGap,
    ruleBreaks: [...ruleBreaks.values()]
      .map((entry) => ({ ...entry, cost: round(entry.cost) }))
      .sort((a, b) => a.cost - b.cost || b.count - a.count),
    signals: {
      qualifying: qualifying.length,
      executed: executedSignals.length,
      missed: missedSignals.length,
      pending: pendingSignals.length,
      // The differentiator: value left on the table inside this specific strategy.
      missedValueR: round(missedValue),
      estimatedCount,
      hasEstimates: estimatedCount > 0,
    },
  };
}

function buildPlaybookOverview(data, accountId, options = {}) {
  const playbooks = (data.playbooks || []).filter(
    (playbook) => !playbook.archived && (!playbook.accountId || playbook.accountId === accountId)
  );

  const reports = playbooks.map((playbook) => buildPlaybookReport(data, playbook, accountId, options));

  const ranked = reports
    .filter((report) => report.followed.count > 0)
    .sort((a, b) => b.followed.average - a.followed.average);

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    count: playbooks.length,
    reports,
    bestPlaybook: ranked[0] || null,
    worstPlaybook: ranked.length > 1 ? ranked[ranked.length - 1] : null,
    totalMissedValueR: round(reports.reduce((sum, report) => sum + report.signals.missedValueR, 0)),
  };
}

module.exports = {
  createPlaybook,
  signalMatchesPlaybook,
  evaluateAdherence,
  buildPlaybookReport,
  buildPlaybookOverview,
};
