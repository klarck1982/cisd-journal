const assert = require('assert');
const { tradingDayKey, DEFAULT_TIMEZONE } = require('../lib/trading-day');
const { buildRiskSnapshot } = require('../lib/engines/risk');

// 01:30 UTC on Jul 27 is still 21:30 on Jul 26 in New York.
// The UTC day has rolled over but the trading day has not.
const lateNight = '2026-07-27T01:30:00Z';
assert.equal(new Date(lateNight).toISOString().slice(0, 10), '2026-07-27');
assert.equal(tradingDayKey(lateNight, 'America/New_York'), '2026-07-26');

// Early morning NY is the same day in both.
assert.equal(tradingDayKey('2026-07-26T14:00:00Z', 'America/New_York'), '2026-07-26');

// Other zones resolve independently.
assert.equal(tradingDayKey(lateNight, 'UTC'), '2026-07-27');
assert.equal(tradingDayKey(lateNight, 'Asia/Damascus'), '2026-07-27');

// Invalid timezone must not throw; it falls back to UTC.
assert.equal(tradingDayKey(lateNight, 'Not/AZone'), '2026-07-27');
assert.equal(tradingDayKey('not-a-date'), '');
assert.equal(DEFAULT_TIMEZONE, 'America/New_York');

// The daily loss budget must NOT reset while the New York session is still open.
const data = {
  settings: { timezone: 'America/New_York' },
  accounts: [{ id: 'a', capital: 100000, currentBalance: 98000, dailyLoss: 3, maxDrawdown: 10 }],
  trades: [{ accountId: 'a', date: '2026-07-26', netProfit: -2000, resultR: -2 }],
  openPositions: [],
};

const stillToday = buildRiskSnapshot(data, 'a', { now: lateNight });
assert.equal(stillToday.today, '2026-07-26');
assert.equal(stillToday.balances.todayClosedPnl, -2000, 'loss must still count against today');
assert.equal(stillToday.limits.dailyLossRemaining, 1000);

// Same instant interpreted as UTC would have wrongly zeroed the day's loss.
const utcView = buildRiskSnapshot({ ...data, settings: { timezone: 'UTC' } }, 'a', { now: lateNight });
assert.equal(utcView.today, '2026-07-27');
assert.equal(utcView.balances.todayClosedPnl, 0);

// ---- Max drawdown measured from the high-water mark, not from starting capital ----

// Account grew to 110k then fell back to 104k => real drawdown is 6k, not 0.
const grown = {
  accounts: [{ id: 'a', capital: 100000, currentBalance: 104000, maxDrawdown: 10 }],
  trades: [
    { accountId: 'a', date: '2026-07-20', netProfit: 10000 },
    { accountId: 'a', date: '2026-07-21', netProfit: -6000 },
  ],
  openPositions: [],
};
const grownRisk = buildRiskSnapshot(grown, 'a', { today: '2026-07-26' });
assert.equal(grownRisk.limits.peakBalance, 110000);
assert.equal(grownRisk.limits.currentDrawdown, 6000, 'drawdown must be measured from the peak');
assert.equal(grownRisk.limits.drawdownRemaining, 4000);

// A firm-synced high-water mark takes priority when present.
const synced = {
  accounts: [{ id: 'a', capital: 100000, currentBalance: 101000, maxDrawdown: 10, syncedBalanceMax: 115000 }],
  trades: [],
  openPositions: [],
};
const syncedRisk = buildRiskSnapshot(synced, 'a', { today: '2026-07-26' });
assert.equal(syncedRisk.limits.peakBalance, 115000);
assert.equal(syncedRisk.limits.currentDrawdown, 14000);

// An account that never grew still reports drawdown from capital.
const flat = {
  accounts: [{ id: 'a', capital: 100000, currentBalance: 97000, maxDrawdown: 10 }],
  trades: [{ accountId: 'a', date: '2026-07-26', netProfit: -3000 }],
  openPositions: [],
};
assert.equal(buildRiskSnapshot(flat, 'a', { today: '2026-07-26' }).limits.currentDrawdown, 3000);

console.log('Trading Day QA: PASS (timezone-aware day, high-water-mark drawdown)');
