/**
 * Daily Review Engine — the habit loop.
 *
 * Discipline is a daily practice, not a monthly report. This engine powers three moments:
 *
 *   morning  : a pre-session checklist and a declared mental state
 *   evening   : what actually happened, against what was planned
 *   weekly    : whether the trader is trending better or worse
 *
 * It also answers a question no other part of the app can: does the trader's declared
 * mental state predict their results? That turns a vague feeling ("I trade badly when
 * tilted") into a number they can act on.
 *
 * The `daily` collection was previously written by the app and read by nothing.
 * This engine gives that data a purpose.
 */

const { tradingDayKey, DEFAULT_TIMEZONE } = require('../trading-day');

const MOODS = ['calm', 'anxious', 'excited', 'tired', 'frustrated'];

const DEFAULT_CHECKLIST = [
  'reviewedNews',
  'markedLevels',
  'knowDailyLimit',
  'reviewedPlan',
];

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
 * Result of a trade in R when available.
 * A derived R is fine here: this engine reports in R and never sums currency alongside it.
 */
function tradeR(trade) {
  return hasValue(trade.resultR) ? toNumber(trade.resultR) : null;
}

function normalizeMood(value) {
  const mood = String(value || '').trim().toLowerCase();
  return MOODS.includes(mood) ? mood : null;
}

/**
 * The day a trade belongs to, in the account's trading timezone.
 * Falls back through the fields different importers populate.
 */
function tradeDay(trade, timezone) {
  const raw = trade.date || trade.closeTime || trade.createdAt || trade.openTime;
  if (!raw) return '';
  // `date` is already a plain YYYY-MM-DD key from the importers.
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  return tradingDayKey(raw, timezone);
}

function summarize(values) {
  if (!values.length) return { count: 0, wins: 0, losses: 0, net: 0, average: 0, winRate: 0 };
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

function entryFor(data, accountId, day) {
  return (data.daily || []).find((item) => item.accountId === accountId && item.day === day) || null;
}

/**
 * Everything the evening review screen needs for a single day.
 */
function buildDaySummary(data, accountId, day, options = {}) {
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const entry = entryFor(data, accountId, day);

  const trades = (data.trades || []).filter(
    (trade) => trade.accountId === accountId && tradeDay(trade, timezone) === day
  );

  const results = trades.map(tradeR).filter((value) => value !== null);
  const performance = summarize(results);

  // Signals decided on this day, so the trader can see what they walked away from.
  const signals = (data.signals || []).filter((signal) => (signal.mode || 'LIVE') === 'LIVE');
  let missed = 0;
  let executed = 0;
  for (const signal of signals) {
    const decision = signal.decisions?.[accountId];
    if (!decision?.updatedAt) continue;
    if (tradingDayKey(decision.updatedAt, timezone) !== day) continue;
    const status = String(decision.status || '').toUpperCase();
    if (status === 'MISSED') missed++;
    else if (status) executed++;
  }

  const checklist = entry?.checklist || {};
  const checklistItems = Object.keys(checklist).length ? Object.keys(checklist) : DEFAULT_CHECKLIST;
  const completed = checklistItems.filter((key) => checklist[key] === true).length;

  return {
    accountId,
    day,
    hasEntry: !!entry,
    mood: normalizeMood(entry?.mood),
    checklist,
    checklistProgress: {
      completed,
      total: checklistItems.length,
      rate: checklistItems.length ? round(completed / checklistItems.length, 4) : 0,
    },
    plan: entry?.plan || '',
    wentWell: entry?.wentWell || '',
    toImprove: entry?.toImprove || '',
    reviewedAt: entry?.reviewedAt || '',
    performance,
    signals: { executed, missed },
    tradesWithoutR: trades.length - results.length,
  };
}

/**
 * Does the declared mental state predict performance?
 * Only moods with enough samples are reported, so a single bad day cannot masquerade
 * as a behavioural pattern.
 */
function buildMoodCorrelation(data, accountId, options = {}) {
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const minimumSamples = options.minimumSamples || 3;

  const byMood = new Map();
  const trades = (data.trades || []).filter((trade) => trade.accountId === accountId);

  for (const entry of data.daily || []) {
    if (entry.accountId !== accountId) continue;
    const mood = normalizeMood(entry.mood);
    if (!mood) continue;

    const dayTrades = trades.filter((trade) => tradeDay(trade, timezone) === entry.day);
    const results = dayTrades.map(tradeR).filter((value) => value !== null);
    if (!results.length) continue;

    const bucket = byMood.get(mood) || { mood, days: 0, results: [] };
    bucket.days++;
    bucket.results.push(...results);
    byMood.set(mood, bucket);
  }

  const moods = [...byMood.values()]
    .map((bucket) => ({
      mood: bucket.mood,
      days: bucket.days,
      ...summarize(bucket.results),
      reliable: bucket.days >= minimumSamples,
    }))
    .sort((a, b) => b.average - a.average);

  const reliable = moods.filter((item) => item.reliable);

  return {
    moods,
    best: reliable[0] || null,
    worst: reliable.length > 1 ? reliable[reliable.length - 1] : null,
    hasEnoughData: reliable.length >= 2,
  };
}

/**
 * Performance after consecutive losses — the classic tilt pattern.
 * Compares the average result of a trade that follows two or more losses against the
 * trader's baseline.
 */
function buildTiltAnalysis(data, accountId, options = {}) {
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const threshold = options.lossStreakThreshold || 2;

  const ordered = (data.trades || [])
    .filter((trade) => trade.accountId === accountId && tradeR(trade) !== null)
    .sort((a, b) => String(tradeDay(a, timezone) + (a.openTime || '')).localeCompare(String(tradeDay(b, timezone) + (b.openTime || ''))));

  const baseline = [];
  const afterStreak = [];
  let streak = 0;

  for (const trade of ordered) {
    const result = tradeR(trade);
    if (streak >= threshold) afterStreak.push(result);
    else baseline.push(result);

    if (result < 0) streak++;
    else streak = 0;
  }

  const baselineStats = summarize(baseline);
  const streakStats = summarize(afterStreak);

  // Only claim a pattern once there is enough evidence on both sides.
  const hasEvidence = baselineStats.count >= 3 && streakStats.count >= 3;
  const degradation = hasEvidence && baselineStats.average !== 0
    ? round((streakStats.average - baselineStats.average) / Math.abs(baselineStats.average), 4)
    : null;

  return {
    threshold,
    baseline: baselineStats,
    afterLossStreak: streakStats,
    hasEvidence,
    // Negative means performance drops after a losing streak.
    degradation,
  };
}

/**
 * Week-over-week trend so the trader can see whether the habit is working.
 */
function buildWeeklyTrend(data, accountId, options = {}) {
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const today = options.today || tradingDayKey(options.now, timezone);

  const dayMs = 86400000;
  const todayTime = new Date(`${today}T00:00:00Z`).getTime();
  const weekAgo = new Date(todayTime - 6 * dayMs).toISOString().slice(0, 10);
  const twoWeeksAgo = new Date(todayTime - 13 * dayMs).toISOString().slice(0, 10);

  const trades = (data.trades || []).filter((trade) => trade.accountId === accountId);
  const inRange = (day, from, to) => day >= from && day <= to;

  const current = [];
  const previous = [];
  for (const trade of trades) {
    const result = tradeR(trade);
    if (result === null) continue;
    const day = tradeDay(trade, timezone);
    if (inRange(day, weekAgo, today)) current.push(result);
    else if (inRange(day, twoWeeksAgo, weekAgo)) previous.push(result);
  }

  const currentStats = summarize(current);
  const previousStats = summarize(previous);

  const reviewedDays = (data.daily || []).filter(
    (entry) => entry.accountId === accountId && entry.day >= weekAgo && entry.day <= today && entry.reviewedAt
  ).length;

  return {
    from: weekAgo,
    to: today,
    current: currentStats,
    previous: previousStats,
    netChange: round(currentStats.net - previousStats.net),
    averageChange: round(currentStats.average - previousStats.average),
    reviewedDays,
    reviewRate: round(reviewedDays / 7, 4),
  };
}

function buildDailyReviewSnapshot(data, accountId, options = {}) {
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const today = options.today || tradingDayKey(options.now, timezone);

  return {
    accountId,
    today,
    generatedAt: new Date().toISOString(),
    checklistKeys: DEFAULT_CHECKLIST,
    moods: MOODS,
    todaySummary: buildDaySummary(data, accountId, today, { timezone }),
    moodCorrelation: buildMoodCorrelation(data, accountId, { timezone }),
    tilt: buildTiltAnalysis(data, accountId, { timezone }),
    weekly: buildWeeklyTrend(data, accountId, { timezone, today }),
  };
}

module.exports = {
  MOODS,
  DEFAULT_CHECKLIST,
  buildDaySummary,
  buildMoodCorrelation,
  buildTiltAnalysis,
  buildWeeklyTrend,
  buildDailyReviewSnapshot,
};
