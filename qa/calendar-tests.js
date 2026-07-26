const assert = require('assert');
const { buildMonthCalendar, listTradedMonths } = require('../lib/engines/calendar');

const base = { settings: { timezone: 'America/New_York' }, accounts: [{ id: 'a' }] };

const trades = [
  ['2026-07-01', 120], ['2026-07-02', -80], ['2026-07-03', 260],
  ['2026-07-06', 95], ['2026-07-08', -140], ['2026-07-09', 180], ['2026-07-10', 60],
  ['2026-07-13', -200], ['2026-07-15', 340], ['2026-07-16', -50],
  ['2026-07-20', 210], ['2026-07-22', -90], ['2026-07-24', 150],
].map(([date, netProfit]) => ({ accountId: 'a', date, netProfit }));

const calendar = buildMonthCalendar({ ...base, trades }, 'a', { month: '2026-07' });

// -------------------------------------------------------------- grid shape
// July 2026 starts on a Wednesday, so a Sunday-first grid needs 3 leading blanks.
assert.equal(calendar.weeks[0].cells[0].empty, true);
assert.equal(calendar.weeks[0].cells[1].empty, true);
assert.equal(calendar.weeks[0].cells[2].empty, true);
assert.equal(calendar.weeks[0].cells[3].dayNumber, 1);

// Every row must be exactly 7 cells or the CSS grid breaks.
for (const week of calendar.weeks) {
  assert.equal(week.cells.length, 7, 'every week row must have 7 cells');
}

// All 31 days must be present exactly once.
const dayNumbers = calendar.weeks
  .flatMap((week) => week.cells)
  .filter((cell) => !cell.empty)
  .map((cell) => cell.dayNumber);
assert.equal(dayNumbers.length, 31);
assert.equal(new Set(dayNumbers).size, 31);
assert.equal(Math.min(...dayNumbers), 1);
assert.equal(Math.max(...dayNumbers), 31);

// --------------------------------------------------------------- totals
assert.equal(calendar.unit, 'currency');
assert.equal(calendar.totals.net, 855);
assert.equal(calendar.totals.tradedDays, 13);
assert.equal(calendar.totals.greenDays, 8);
assert.equal(calendar.totals.redDays, 5);
assert.equal(calendar.totals.dayWinRate, round4(8 / 13));
assert.equal(calendar.best.day, '2026-07-15');
assert.equal(calendar.best.value, 340);
assert.equal(calendar.worst.day, '2026-07-13');
assert.equal(calendar.worst.value, -200);

function round4(value) {
  return Math.round(value * 10000) / 10000;
}

// Week totals must sum to the month total.
const weekSum = calendar.weeks.reduce((sum, week) => sum + week.total, 0);
assert.equal(Math.round(weekSum), calendar.totals.net);

// ------------------------------------------------------ weekday breakdown
const friday = calendar.weekdays.find((item) => item.weekday === 5);
assert.equal(friday.days, 3, '3rd, 10th and 24th are Fridays');
assert.equal(friday.value, 470);
// A weekday that was never traded reports zero rather than dividing by zero.
const sunday = calendar.weekdays.find((item) => item.weekday === 0);
assert.equal(sunday.days, 0);
assert.equal(sunday.average, 0);

// ----------------------------------------------------- multiple same-day trades
const sameDay = buildMonthCalendar(
  {
    ...base,
    trades: [
      { accountId: 'a', date: '2026-07-05', netProfit: 100 },
      { accountId: 'a', date: '2026-07-05', netProfit: -40 },
      { accountId: 'a', date: '2026-07-05', netProfit: 25 },
    ],
  },
  'a',
  { month: '2026-07' }
);
const fifth = sameDay.weeks.flatMap((week) => week.cells).find((cell) => cell.dayNumber === 5);
assert.equal(fifth.count, 3, 'all three trades land on the same cell');
assert.equal(fifth.value, 85);
assert.equal(fifth.wins, 2);
assert.equal(fifth.losses, 1);
assert.equal(sameDay.totals.tradedDays, 1, 'one day, not three');

// ------------------------------------------------------------ unit picking
// An account journalling in R must be reported in R, never mixed with cash.
const rCalendar = buildMonthCalendar(
  {
    ...base,
    trades: [
      { accountId: 'a', date: '2026-07-05', resultR: 2 },
      { accountId: 'a', date: '2026-07-06', resultR: -1 },
    ],
  },
  'a',
  { month: '2026-07' }
);
assert.equal(rCalendar.unit, 'R');
assert.equal(rCalendar.totals.net, 1);

// A derived R must not hijack a currency account (regression guard).
const derived = buildMonthCalendar(
  {
    ...base,
    trades: [{ accountId: 'a', date: '2026-07-05', netProfit: 500, resultR: 0.5, resultRSource: 'derived' }],
  },
  'a',
  { month: '2026-07' }
);
assert.equal(derived.unit, 'currency');
assert.equal(derived.totals.net, 500);

// -------------------------------------------------------------- isolation
const otherAccount = buildMonthCalendar(
  { ...base, trades: [...trades, { accountId: 'b', date: '2026-07-05', netProfit: 9999 }] },
  'a',
  { month: '2026-07' }
);
assert.equal(otherAccount.totals.net, 855, 'other accounts must not leak in');

// Trades from another month must not appear.
const otherMonth = buildMonthCalendar(
  { ...base, trades: [...trades, { accountId: 'a', date: '2026-08-05', netProfit: 9999 }] },
  'a',
  { month: '2026-07' }
);
assert.equal(otherMonth.totals.net, 855);

// ------------------------------------------------------------ empty month
const empty = buildMonthCalendar({ ...base, trades: [] }, 'a', { month: '2026-07' });
assert.equal(empty.totals.net, 0);
assert.equal(empty.totals.tradedDays, 0);
assert.equal(empty.totals.dayWinRate, 0);
assert.equal(empty.best, null);
assert.equal(empty.worst, null);
assert.equal(empty.weeks.flatMap((week) => week.cells).filter((cell) => !cell.empty).length, 31);

// A month with only losses has no "best" day to celebrate.
const allRed = buildMonthCalendar(
  { ...base, trades: [{ accountId: 'a', date: '2026-07-05', netProfit: -100 }] },
  'a',
  { month: '2026-07' }
);
assert.equal(allRed.best, null);
assert.equal(allRed.worst.value, -100);

// ------------------------------------------------------------- leap year
const leap = buildMonthCalendar({ ...base, trades: [] }, 'a', { month: '2028-02' });
assert.equal(leap.weeks.flatMap((week) => week.cells).filter((cell) => !cell.empty).length, 29, '2028 is a leap year');
const nonLeap = buildMonthCalendar({ ...base, trades: [] }, 'a', { month: '2027-02' });
assert.equal(nonLeap.weeks.flatMap((week) => week.cells).filter((cell) => !cell.empty).length, 28);

// --------------------------------------------------------- week start option
const mondayFirst = buildMonthCalendar({ ...base, trades }, 'a', { month: '2026-07', weekStartsOn: 1 });
assert.equal(mondayFirst.weeks[0].cells[0].empty, true);
assert.equal(mondayFirst.weeks[0].cells[2].dayNumber, 1, 'Wednesday is the 3rd slot when weeks start on Monday');

// ------------------------------------------------------------ month listing
const months = listTradedMonths(
  { trades: [...trades, { accountId: 'a', date: '2026-05-02', netProfit: 10 }] },
  'a'
);
assert.deepEqual(months, ['2026-07', '2026-05'], 'newest first');
assert.deepEqual(listTradedMonths({ trades: [] }, 'a'), []);

console.log('Calendar QA: PASS (grid alignment, totals, weekday split, units, leap years)');
