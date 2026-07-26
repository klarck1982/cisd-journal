const assert = require('assert');
const {
  MOODS,
  buildDaySummary,
  buildMoodCorrelation,
  buildTiltAnalysis,
  buildWeeklyTrend,
  buildDailyReviewSnapshot,
} = require('../lib/engines/daily-review');

const base = {
  settings: { timezone: 'America/New_York' },
  accounts: [{ id: 'a' }],
  signals: [],
};

// ------------------------------------------------------------- day summary
const dayData = {
  ...base,
  daily: [{
    accountId: 'a',
    day: '2026-07-26',
    mood: 'calm',
    plan: 'Only London setups',
    checklist: { reviewedNews: true, markedLevels: false, knowDailyLimit: true, reviewedPlan: false },
  }],
  trades: [
    { accountId: 'a', date: '2026-07-26', resultR: 2.2 },
    { accountId: 'a', date: '2026-07-26', resultR: -1 },
    { accountId: 'a', date: '2026-07-25', resultR: 5 },
    { accountId: 'b', date: '2026-07-26', resultR: 99 },
  ],
};

const day = buildDaySummary(dayData, 'a', '2026-07-26');
assert.equal(day.hasEntry, true);
assert.equal(day.mood, 'calm');
assert.equal(day.plan, 'Only London setups');
assert.equal(day.performance.count, 2, 'other days and other accounts are excluded');
assert.equal(day.performance.net, 1.2);
assert.equal(day.checklistProgress.completed, 2);
assert.equal(day.checklistProgress.total, 4);
assert.equal(day.checklistProgress.rate, 0.5);

// A day with no entry still reports its trades.
const noEntry = buildDaySummary(dayData, 'a', '2026-07-25');
assert.equal(noEntry.hasEntry, false);
assert.equal(noEntry.mood, null);
assert.equal(noEntry.performance.count, 1);
// With no saved checklist the default keys define the total, not zero.
assert.equal(noEntry.checklistProgress.total, 4);
assert.equal(noEntry.checklistProgress.completed, 0);

// An unknown mood string must not leak through as a valid mood.
const badMood = buildDaySummary(
  { ...base, daily: [{ accountId: 'a', day: '2026-07-26', mood: 'ecstatic' }], trades: [] },
  'a',
  '2026-07-26'
);
assert.equal(badMood.mood, null);

// Trades without an R are counted so the user knows their data is incomplete.
const partial = buildDaySummary(
  { ...base, daily: [], trades: [{ accountId: 'a', date: '2026-07-26', netProfit: 100 }] },
  'a',
  '2026-07-26'
);
assert.equal(partial.performance.count, 0);
assert.equal(partial.tradesWithoutR, 1);

// Signal decisions are attributed to the day they were made.
const withSignals = buildDaySummary(
  {
    ...base,
    daily: [],
    trades: [],
    signals: [
      { SignalID: 'S1', mode: 'LIVE', decisions: { a: { status: 'MISSED', updatedAt: '2026-07-26T14:00:00Z' } } },
      { SignalID: 'S2', mode: 'LIVE', decisions: { a: { status: 'ORDER_PLACED', updatedAt: '2026-07-26T15:00:00Z' } } },
      { SignalID: 'S3', mode: 'LIVE', decisions: { a: { status: 'MISSED', updatedAt: '2026-07-20T14:00:00Z' } } },
    ],
  },
  'a',
  '2026-07-26'
);
assert.equal(withSignals.signals.missed, 1, 'only decisions made on this day count');
assert.equal(withSignals.signals.executed, 1);

// ------------------------------------------------------- mood correlation
const moodData = {
  ...base,
  daily: [
    { accountId: 'a', day: '2026-07-20', mood: 'calm' },
    { accountId: 'a', day: '2026-07-21', mood: 'calm' },
    { accountId: 'a', day: '2026-07-22', mood: 'calm' },
    { accountId: 'a', day: '2026-07-23', mood: 'tired' },
    { accountId: 'a', day: '2026-07-24', mood: 'tired' },
    { accountId: 'a', day: '2026-07-25', mood: 'tired' },
  ],
  trades: [
    { accountId: 'a', date: '2026-07-20', resultR: 2 },
    { accountId: 'a', date: '2026-07-21', resultR: 1.5 },
    { accountId: 'a', date: '2026-07-22', resultR: 2.5 },
    { accountId: 'a', date: '2026-07-23', resultR: -1 },
    { accountId: 'a', date: '2026-07-24', resultR: -1.5 },
    { accountId: 'a', date: '2026-07-25', resultR: -0.5 },
  ],
};

const mood = buildMoodCorrelation(moodData, 'a');
assert.equal(mood.best.mood, 'calm');
assert.equal(mood.best.average, 2);
assert.equal(mood.worst.mood, 'tired');
assert.equal(mood.worst.average, -1);
assert.equal(mood.hasEnoughData, true);
assert.ok(mood.moods.every((item) => item.reliable));

// A single day must never be presented as a behavioural pattern.
const thin = buildMoodCorrelation(
  {
    ...base,
    daily: [{ accountId: 'a', day: '2026-07-20', mood: 'anxious' }],
    trades: [{ accountId: 'a', date: '2026-07-20', resultR: -3 }],
  },
  'a'
);
assert.equal(thin.moods[0].reliable, false, 'one day is not evidence');
assert.equal(thin.best, null);
assert.equal(thin.hasEnoughData, false);

// Days with a mood but no trades contribute nothing.
const moodNoTrades = buildMoodCorrelation(
  { ...base, daily: [{ accountId: 'a', day: '2026-07-20', mood: 'calm' }], trades: [] },
  'a'
);
assert.equal(moodNoTrades.moods.length, 0);

// ---------------------------------------------------------- tilt analysis
const tiltData = {
  ...base,
  daily: [],
  trades: [
    { accountId: 'a', date: '2026-07-20', openTime: '01', resultR: 1 },
    { accountId: 'a', date: '2026-07-20', openTime: '02', resultR: 1 },
    { accountId: 'a', date: '2026-07-20', openTime: '03', resultR: 1 },
    { accountId: 'a', date: '2026-07-21', openTime: '01', resultR: -1 },
    { accountId: 'a', date: '2026-07-21', openTime: '02', resultR: -1 },
    // Everything from here follows a two-loss streak.
    { accountId: 'a', date: '2026-07-21', openTime: '03', resultR: -2 },
    { accountId: 'a', date: '2026-07-21', openTime: '04', resultR: -2 },
    { accountId: 'a', date: '2026-07-21', openTime: '05', resultR: -1 },
  ],
};

const tilt = buildTiltAnalysis(tiltData, 'a');
assert.equal(tilt.baseline.count, 5);
assert.equal(tilt.afterLossStreak.count, 3);
assert.equal(tilt.hasEvidence, true);
assert.ok(tilt.degradation < 0, 'performance must be shown as degrading after a losing streak');

// Without enough trades on both sides no claim is made.
const noEvidence = buildTiltAnalysis(
  { ...base, daily: [], trades: [{ accountId: 'a', date: '2026-07-20', resultR: -1 }] },
  'a'
);
assert.equal(noEvidence.hasEvidence, false);
assert.equal(noEvidence.degradation, null);

// ----------------------------------------------------------- weekly trend
const weekly = buildWeeklyTrend(
  {
    ...base,
    daily: [
      { accountId: 'a', day: '2026-07-24', reviewedAt: 'x' },
      { accountId: 'a', day: '2026-07-25', reviewedAt: 'x' },
      { accountId: 'a', day: '2026-07-23' },
    ],
    trades: [
      { accountId: 'a', date: '2026-07-24', resultR: 2 },
      { accountId: 'a', date: '2026-07-25', resultR: 1 },
      { accountId: 'a', date: '2026-07-15', resultR: -1 },
    ],
  },
  'a',
  { today: '2026-07-26' }
);
assert.equal(weekly.current.net, 3);
assert.equal(weekly.previous.net, -1);
assert.equal(weekly.netChange, 4);
assert.equal(weekly.reviewedDays, 2, 'a day without reviewedAt is not a completed review');

// -------------------------------------------------------------- snapshot
const snapshot = buildDailyReviewSnapshot(moodData, 'a', { today: '2026-07-26' });
assert.equal(snapshot.today, '2026-07-26');
assert.equal(snapshot.accountId, 'a');
assert.deepEqual(snapshot.moods, MOODS);
assert.ok(snapshot.checklistKeys.length > 0);
assert.ok(snapshot.todaySummary);
assert.ok(snapshot.moodCorrelation);
assert.ok(snapshot.tilt);
assert.ok(snapshot.weekly);

// An account with no history at all must not throw.
const blank = buildDailyReviewSnapshot({ accounts: [{ id: 'z' }], trades: [], daily: [], signals: [] }, 'z', { today: '2026-07-26' });
assert.equal(blank.todaySummary.performance.count, 0);
assert.equal(blank.moodCorrelation.hasEnoughData, false);
assert.equal(blank.tilt.hasEvidence, false);

console.log('Daily Review QA: PASS (day summary, mood correlation, tilt evidence, weekly trend)');
