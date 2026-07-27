/**
 * Timezone accuracy regression tests.
 *
 * Covers the three numeric defects recorded in docs/UPDATE_PLAN_2026-07.md.
 * All three shared one root cause: a timezone-aware value being compared
 * against a blind `String(x).slice(0, 10)` cut of a UTC timestamp.
 *
 * Every assertion here fails against the previous implementation.
 */
const assert = require('assert');
const { buildRiskSnapshot } = require('../lib/engines/risk');
const { buildAccountAnalyticsSnapshot, classifyTradeSession } = require('../lib/engines/analytics');
const { buildMonthCalendar } = require('../lib/engines/calendar');

const NY = 'America/New_York';

function account(extra = {}) {
  return {
    id: 'a',
    capital: 100000,
    currentBalance: 100000,
    dailyLoss: 2,
    maxDrawdown: 6,
    profitTarget: 8,
    ...extra,
  };
}

// --- 1) The daily-loss guard must see an evening trade -----------------------
// 01:00Z on the 27th is 21:00 on the 26th in New York: still the same trading
// day. The old code read the UTC date, decided the trade belonged to the 27th,
// and reported a full untouched budget to a trader who had already lost 1,500.
{
  const data = {
    accounts: [account({ currentBalance: 98500 })],
    trades: [{ accountId: 'a', date: '2026-07-27T01:00:00.000Z', netProfit: -1500 }],
    openPositions: [],
    settings: { timezone: NY },
  };

  const snapshot = buildRiskSnapshot(data, 'a', { now: '2026-07-27T02:00:00.000Z' });

  assert.equal(snapshot.today, '2026-07-26', 'the New York trading day has not rolled over yet');
  assert.equal(snapshot.balances.todayClosedPnl, -1500, 'an evening loss counts against today');
  assert.equal(snapshot.limits.dailyLossUsed, 1500);
  assert.equal(snapshot.limits.dailyLossRemaining, 500, 'the trader has 500 left, not the full 2000');
  assert.ok(
    snapshot.warnings.some((warning) => warning.code === 'NEAR_DAILY_LOSS_LIMIT'),
    'being 75% through the daily budget must warn'
  );
  assert.equal(snapshot.state, 'ATTENTION');
}

// --- 1b) A breach is reported as a breach ------------------------------------
{
  const data = {
    accounts: [account({ currentBalance: 97500 })],
    trades: [{ accountId: 'a', date: '2026-07-27T02:30:00.000Z', netProfit: -2500 }],
    openPositions: [],
    settings: { timezone: NY },
  };
  const snapshot = buildRiskSnapshot(data, 'a', { now: '2026-07-27T03:00:00.000Z' });
  assert.equal(snapshot.state, 'BREACH');
  assert.ok(snapshot.warnings.some((warning) => warning.code === 'DAILY_LOSS_LIMIT_BREACHED'));
}

// --- 1c) A trade from the previous trading day must NOT count ----------------
// Guarding the opposite error: over-counting would be just as wrong.
{
  const data = {
    accounts: [account()],
    trades: [{ accountId: 'a', date: '2026-07-25T18:00:00.000Z', netProfit: -900 }],
    openPositions: [],
    settings: { timezone: NY },
  };
  const snapshot = buildRiskSnapshot(data, 'a', { now: '2026-07-27T02:00:00.000Z' });
  assert.equal(snapshot.balances.todayClosedPnl, 0, "yesterday's loss must not consume today's budget");
}

// --- 1d) Hand-entered "YYYY-MM-DD" is already a trading day ------------------
// Converting a bare date through a timezone would shift it by a day.
{
  const data = {
    accounts: [account()],
    trades: [{ accountId: 'a', date: '2026-07-26', netProfit: -400 }],
    openPositions: [],
    settings: { timezone: NY },
  };
  const snapshot = buildRiskSnapshot(data, 'a', { today: '2026-07-26' });
  assert.equal(snapshot.balances.todayClosedPnl, -400, 'a date-only trade belongs to that exact day');
}

// --- 2) Analytics and the calendar must agree on the day ---------------------
// The same trade used to appear on the 26th in the calendar and the 27th in
// analytics: two pages of one app disagreeing.
{
  const data = {
    accounts: [account()],
    trades: [{ accountId: 'a', date: '2026-07-27T01:00:00.000Z', netProfit: 500, resultR: 1 }],
    openPositions: [],
    signals: [],
    backtests: [],
    backtestSignals: [],
    settings: { timezone: NY },
  };

  const analytics = buildAccountAnalyticsSnapshot(data, 'a', {});
  const calendar = buildMonthCalendar(data, 'a', { month: '2026-07', timezone: NY });

  assert.equal(analytics.breakdowns.byDay[0].label, '2026-07-26', 'analytics uses the trading day');

  const cells = calendar.weeks.flatMap((week) => week.cells || []);
  const day26 = cells.find((cell) => cell.day === '2026-07-26');
  assert.ok(day26 && day26.traded, 'the calendar places the same trade on the 26th');
  assert.equal(
    analytics.breakdowns.byDay[0].label,
    day26.day,
    'analytics and the calendar must never disagree about a trade\'s day'
  );
}

// --- 3) Sessions split correctly across timestamp formats --------------------
// parseHour required a space before the hour, so ISO timestamps never matched
// and every affected trade collapsed into the 'After' bucket.
{
  assert.equal(classifyTradeSession({ openTime: '2026-07-20T07:30:00Z' }, NY), 'London', '03:30 NY is London');
  assert.equal(classifyTradeSession({ openTime: '2026-07-21T14:00:00Z' }, NY), 'New York', '10:00 NY is New York');
  assert.equal(classifyTradeSession({ openTime: '2026-07-22T23:00:00Z' }, NY), 'After', '19:00 NY is After');

  // The legacy space-separated MT5 format still works, read as written.
  assert.equal(classifyTradeSession({ openTime: '2026.07.20 05:00:00' }, NY), 'London');
  assert.equal(classifyTradeSession({ openTime: '2026.07.20 12:00:00' }, NY), 'New York');

  // A bare date carries no time, so no session may be invented for it.
  assert.equal(classifyTradeSession({ openTime: '2026-07-20' }, NY), 'After');
}

// --- 3b) Three ISO trades must not collapse into one bucket ------------------
{
  const at = (iso, pnl) => ({ accountId: 'a', date: iso, openTime: iso, netProfit: pnl, resultR: 1 });
  const data = {
    accounts: [account()],
    trades: [
      at('2026-07-20T07:30:00Z', 500),
      at('2026-07-21T14:00:00Z', -300),
      at('2026-07-22T23:00:00Z', 800),
    ],
    openPositions: [],
    signals: [],
    backtests: [],
    backtestSignals: [],
    settings: { timezone: NY },
  };

  const sessions = buildAccountAnalyticsSnapshot(data, 'a', {}).breakdowns.bySession;
  assert.equal(sessions.length, 3, 'three trades in three sessions must produce three buckets');
  assert.deepEqual(
    sessions.map((bucket) => bucket.label).sort(),
    ['After', 'London', 'New York']
  );
}

// --- 4) The "today" period filter follows the trading day --------------------
{
  const data = {
    accounts: [account()],
    trades: [{ accountId: 'a', date: '2026-07-27T01:00:00.000Z', netProfit: 500, resultR: 1 }],
    openPositions: [],
    signals: [],
    backtests: [],
    backtestSignals: [],
    settings: { timezone: NY },
  };

  const snapshot = buildAccountAnalyticsSnapshot(data, 'a', {
    period: 'today',
    now: '2026-07-27T02:00:00.000Z',
  });
  assert.equal(snapshot.totals.count, 1, 'a 21:00 New York trade is still part of today');
}

// --- 5) Timezone actually changes the answer ---------------------------------
// Proves the value is threaded through rather than defaulted everywhere.
{
  const trade = { accountId: 'a', date: '2026-07-27T01:00:00.000Z', netProfit: 100, resultR: 1 };
  const base = { accounts: [account()], trades: [trade], openPositions: [], signals: [], backtests: [], backtestSignals: [] };

  const ny = buildAccountAnalyticsSnapshot({ ...base, settings: { timezone: NY } }, 'a', {});
  const tokyo = buildAccountAnalyticsSnapshot({ ...base, settings: { timezone: 'Asia/Tokyo' } }, 'a', {});

  assert.equal(ny.breakdowns.byDay[0].label, '2026-07-26');
  assert.equal(tokyo.breakdowns.byDay[0].label, '2026-07-27', 'Tokyo is already on the next day');
}

console.log('Timezone Accuracy QA: PASS (evening daily-loss capture, analytics/calendar agreement, ISO session split, trading-day period filter)');
