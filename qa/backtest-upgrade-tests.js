/**
 * Backtest upgrade regression tests.
 *
 * Covers the defects found while wiring the JForex replay workflow end-to-end:
 *
 * 1. Machine-timezone independence: SignalTimeNY is a NEW YORK wall clock, so
 *    the stored instant must be identical on a Singapore PC and a New York PC.
 *    The old naive `new Date(...)` parse baked the machine offset into signalAt
 *    and into the de-dup occurrence key.
 *
 * 2. Symbol normalization: the indicator writes "XAU/USD" while traders type
 *    "XAUUSD" — filters must match regardless of slashes/dots/case.
 *
 * 3. Session vocabulary: the indicator emits London / NY / Asia / Closed —
 *    "NY" must normalize to the same bucket the UI calls "New York".
 *
 * 4. Backtest equity events are dated by signalAt (when the CISD formed), not
 *    by importedAt (when the CSV was read).
 *
 * 5. Indicator decisions bridge: reviews map to the chart vocabulary
 *    (WIN/LOSS/BE → ENTERED, SKIPPED → SKIPPED, MISSED → IGNORED), backtest
 *    reviews win over stale live decisions for the same SignalID.
 *
 * 6. Filter attribution: tri-state factor values (1 passed / 0 failed /
 *    - inactive) drive the "best 4 conditions" comparison.
 */

const assert = require('assert');

const {
  parseSignalTimestamp,
  matchesBacktestFilters,
  normalizeSession,
  normalizeSymbol,
  normalizeTimeframe,
  normalizeIndicatorSignal,
  importBacktestSignals,
} = require('../lib/cisd-signals');
const { fileSignature, signatureKey, hasFileChanged, retryDelay } = require('../lib/backtest-capture');
const { serializeDecisions } = require('../lib/backtest-decisions');
const { buildFactorBreakdown, evaluateCombination, findComboLeaders, factorValue } = require('../lib/engines/backtest-factors');
const { createStore } = require('../lib/store');
const path = require('path');
const store = createStore({ getPath: () => path.join(__dirname, 'fixtures') });

// --- 1) NY wall-clock parsing is machine-timezone independent ---------------
for (const tz of ['Asia/Singapore', 'America/New_York', 'Asia/Damascus']) {
  process.env.TZ = tz;
  // intl caches are per-process; constructing fresh Date objects respects TZ.
  const summer = parseSignalTimestamp({ SignalTimeNY: '2026-07-15 09:00' });
  const winter = parseSignalTimestamp({ SignalTimeNY: '2026-01-15 09:00' });
  assert.equal(summer.toISOString(), '2026-07-15T13:00:00.000Z', `${tz}: July (EDT) 09:00 NY = 13:00Z`);
  assert.equal(winter.toISOString(), '2026-01-15T14:00:00.000Z', `${tz}: January (EST) 09:00 NY = 14:00Z`);
}

// Indicator/Excel-compatible fallbacks: the source is ISO, but a CSV viewed or
// exported through Excel can expose M/D/YYYY and turn +Cisd into #NAME?.
const slashTime = parseSignalTimestamp({ SignalTimeNY: '1/2/2026 8:30' });
assert.equal(slashTime.toISOString(), '2026-01-02T13:30:00.000Z', 'M/D/YYYY H:mm is interpreted as a New York wall clock');
assert.equal(
  normalizeIndicatorSignal({ SignalID: 'XAU_USD_15m_SELL_1767359700000', Direction: '#NAME?' }).Direction,
  '-Cisd',
  'a corrupted Excel direction falls back to the BUY/SELL token in SignalID'
);

const signatureA = fileSignature({ size: 10, mtimeMs: 100, ctimeMs: 100 });
const signatureB = fileSignature({ size: 11, mtimeMs: 100, ctimeMs: 100 });
assert.equal(signatureKey(signatureA), '10:100:100');
assert.ok(hasFileChanged(signatureA, signatureB), 'an appended row changes the capture fingerprint');
assert.equal(retryDelay(0), 250);
assert.equal(retryDelay(99), 4000);

// --- 2) Symbol normalization: XAU/USD matches a XAUUSD filter ---------------
assert.equal(normalizeSymbol('XAU/USD'), 'XAUUSD');
assert.equal(normalizeSymbol('xau.usd'), 'XAUUSD');
assert.equal(normalizeTimeframe('15'), '15m');
assert.equal(normalizeTimeframe('M15'), '15m');
assert.equal(normalizeTimeframe('1H'), '60m');
assert.ok(
  matchesBacktestFilters(
    { SignalTimeNY: '2026-07-24 08:15', Session: 'London', Instrument: 'XAU/USD', TF: '15m' },
    { start: '2026-07-24', end: '2026-07-24', session: 'London', symbol: 'XAUUSD', tf: '15' }
  ),
  'the indicator writes XAU/USD; the trader types XAUUSD — they must match'
);

// --- 3) Session vocabulary ----------------------------------------------------
assert.equal(normalizeSession('NY'), 'new york');
assert.equal(normalizeSession('New York'), 'new york');
assert.equal(normalizeSession('Asia'), 'asia');
assert.equal(normalizeSession('London'), 'london');
assert.equal(normalizeSession('Closed'), 'after');
assert.ok(
  matchesBacktestFilters(
    { SignalTimeNY: '2026-07-24 09:30', Session: 'NY', Instrument: 'XAU/USD', TF: '15m' },
    { start: '2026-07-24', end: '2026-07-24', session: 'New York' }
  ),
  'indicator session "NY" must satisfy the UI filter "New York"'
);

// Date-range edges are New York calendar days on any machine.
for (const tz of ['Asia/Singapore', 'America/New_York']) {
  process.env.TZ = tz;
  assert.ok(
    matchesBacktestFilters(
      { SignalTimeNY: '2026-07-24 23:55', Session: 'NY', Instrument: 'XAU/USD', TF: '15m' },
      { start: '2026-07-24', end: '2026-07-24' }
    ),
    `${tz}: 23:55 NY on the end date is inside the range`
  );
  assert.ok(
    !matchesBacktestFilters(
      { SignalTimeNY: '2026-07-25 00:05', Session: 'Asia', Instrument: 'XAU/USD', TF: '15m' },
      { start: '2026-07-24', end: '2026-07-24' }
    ),
    `${tz}: 00:05 NY the next day is outside the range`
  );
}

// New York calendar boundaries must remain correct on 23-hour and 25-hour
// daylight-saving days; adding a fixed 24 hours would leak into the adjacent
// date in March and cut off the final hour in November.
assert.ok(
  matchesBacktestFilters(
    { SignalTimeNY: '2026-03-08 23:59', Session: 'NY', Instrument: 'XAUUSD', TF: '15m' },
    { start: '2026-03-08', end: '2026-03-08' }
  ),
  'the DST-start day includes its final New York minute'
);
assert.ok(
  !matchesBacktestFilters(
    { SignalTimeNY: '2026-03-09 00:00', Session: 'NY', Instrument: 'XAUUSD', TF: '15m' },
    { start: '2026-03-08', end: '2026-03-08' }
  ),
  'the day after DST start is outside the selected date'
);
assert.ok(
  matchesBacktestFilters(
    { SignalTimeNY: '2026-11-01 23:59', Session: 'NY', Instrument: 'XAUUSD', TF: '15m' },
    { start: '2026-11-01', end: '2026-11-01' }
  ),
  'the DST-end day includes its repeated final hour'
);
assert.ok(
  !matchesBacktestFilters(
    { SignalTimeNY: '2026-11-02 00:00', Session: 'NY', Instrument: 'XAUUSD', TF: '15m' },
    { start: '2026-11-01', end: '2026-11-01' }
  ),
  'the day after DST end is outside the selected date'
);

// --- 4) Occurrence keys are stable across machines (de-dup survives sync) -----
process.env.TZ = 'Asia/Singapore';
const csv = [
  'SignalID,SignalTimeNY,WaveStartTimeNY,Date,Day,Session,Instrument,TF,Direction,Grade,Score,Trend,Fib,MS,HTF,MomVol,Confirmed',
  'XAU_USD_15m_BUY_1785000000000,2026-07-24 08:15,2026-07-24 06:30,2026-07-24,Friday,London,XAU/USD,15m,+Cisd,Premium,3/4,1,1,0,1,1,1',
].join('\n');

function freshState() {
  const state = store.initial();
  state.backtestSignals = [];
  state.backtests = [];
  state.importHistory = [];
  state.signals = [];
  return state;
}

const backtest = {
  id: 'bt-tz',
  accountId: 'a1',
  filters: { start: '2026-07-24', end: '2026-07-24', session: '', symbol: 'XAUUSD', tf: '' },
};

const stateA = freshState();
const first = importBacktestSignals(stateA, csv, backtest);
assert.equal(first.count, 1);
const occurrenceA = stateA.backtestSignals[0];
assert.equal(occurrenceA.signalAt, '2026-07-24T12:15:00.000Z', '08:15 NY summer = 12:15Z');
assert.equal(occurrenceA.waveStartAt, '2026-07-24T10:30:00.000Z', 'wave start 06:30 NY = 10:30Z');

process.env.TZ = 'America/New_York';
const stateB = freshState();
importBacktestSignals(stateB, csv, backtest);
const occurrenceB = stateB.backtestSignals[0];
assert.equal(occurrenceA.signalAt, occurrenceB.signalAt, 'the stored instant must not depend on the PC timezone');
assert.equal(occurrenceA.occurrenceKey, occurrenceB.occurrenceKey, 'de-dup keys must not depend on the PC timezone');

// --- 5) Indicator append-only order ------------------------------------------
// The indicator appends a historical Replay row at the bottom of the CSV. The
// importer must still accept it and the renderer can sort the resulting rows by
// signalAt afterwards.
const indicatorCsv = [
  'SignalID,SignalTimeNY,WaveStartTimeNY,Date,Day,Session,Instrument,TF,Direction,Grade,Score,Trend,Fib,MS,HTF,MomVol,Confirmed',
  'XAU_USD_15m_SELL_1767663900000,2026-01-06 03:45:00,2026-01-06 03:30:00,2026-01-06,Tuesday,London,XAU/USD,15m,-Cisd,Standard,2/2,-,1,-,-,1,1',
  'XAU_USD_15m_SELL_1767359700000,1/2/2026 8:30,1/2/2026 7:45,1/2/2026,Friday,NY,XAU/USD,15m,#NAME?,Standard,2/2,-,1,-,-,1,1',
].join('\n');
const indicatorState = freshState();
const indicatorResult = importBacktestSignals(
  indicatorState,
  indicatorCsv,
  { id: 'bt-indicator', accountId: 'a1', filters: { start: '2026-01-02', end: '2026-01-06', symbol: 'XAUUSD', tf: '15' } }
);
assert.equal(indicatorResult.count, 2, 'both an ISO row and an appended M/D/YYYY row are imported');
assert.equal(indicatorState.backtestSignals[1].Direction, '-Cisd', 'direction survives the Excel #NAME? display');
assert.deepEqual(
  indicatorState.backtestSignals.map((item) => item.signalAt).sort(),
  ['2026-01-02T13:30:00.000Z', '2026-01-06T08:45:00.000Z'],
  'signal order is independent of the CSV row order'
);

// --- 6) Decisions bridge: chart vocabulary + backtest priority ---------------
const decisionState = {
  signals: [
    { SignalID: 'SIG-LIVE-1', decisions: { a1: { status: 'EXECUTED' } } },
    { SignalID: 'SIG-BOTH', decisions: { a1: { status: 'MISSED' } } },
  ],
  backtestSignals: [
    { baseSignalId: 'SIG-WIN', status: 'WIN' },
    { baseSignalId: 'SIG-SKIP', status: 'SKIPPED' },
    { baseSignalId: 'SIG-IGNORE', status: 'MISSED' },
    { baseSignalId: 'SIG-PENDING', status: 'NEW' },
    { baseSignalId: 'SIG-BOTH', status: 'LOSS' },
  ],
};
const decisionsCsv = serializeDecisions(decisionState);
assert.ok(decisionsCsv.includes('SIG-LIVE-1,ENTERED'), 'live executed → ENTERED');
assert.ok(decisionsCsv.includes('SIG-WIN,ENTERED'), 'backtest WIN → ENTERED');
assert.ok(decisionsCsv.includes('SIG-SKIP,SKIPPED'), 'backtest SKIPPED → SKIPPED');
assert.ok(decisionsCsv.includes('SIG-IGNORE,IGNORED'), 'backtest MISSED → IGNORED');
assert.ok(!decisionsCsv.includes('SIG-PENDING'), 'unreviewed signals are not written (chart shows its default)');
assert.ok(decisionsCsv.includes('SIG-BOTH,ENTERED'), 'a graded backtest review beats the stale live decision');
assert.ok(!decisionsCsv.includes('SIG-BOTH,IGNORED'), 'the stale live decision is overwritten, not duplicated');

// --- 6) Factor attribution -----------------------------------------------------
function reviewed(factors, status, resultR) {
  return {
    Trend: factors[0], Fib: factors[1], MS: factors[2], HTF: factors[3], MomVol: factors[4], Confirmed: factors[5],
    status, resultR,
  };
}
const factorSignals = [
  reviewed(['1', '1', '-', '-', '1', '1'], 'WIN', 2),
  reviewed(['1', '1', '-', '-', '1', '1'], 'WIN', 1.5),
  reviewed(['1', '1', '1', '0', '1', '1'], 'LOSS', -1),
  reviewed(['1', '0', '-', '-', '0', '1'], 'LOSS', -1),
  reviewed(['0', '-', '-', '-', '-', '0'], 'MISSED', null), // unscored: excluded from R math
];

const breakdown = buildFactorBreakdown(factorSignals);
const fib = breakdown.find((row) => row.key === 'Fib');
assert.equal(fib.passed.scored, 3);
assert.equal(fib.failed.scored, 1);
assert.ok(Math.abs(fib.passed.netR - 2.5) < 1e-9, 'net R of Fib passers sums only scored reviews');
assert.equal(fib.inactive.scored, 0);

const best4 = evaluateCombination(factorSignals, ['Trend', 'Fib', 'MomVol', 'Confirmed']);
assert.equal(best4.matching.scored, 3, 'three signals pass all four conditions');
assert.equal(best4.others.scored, 1);
assert.ok(best4.matching.avgR > best4.others.avgR, 'the 4-condition combo outperforms the rest');

const leaders = findComboLeaders(factorSignals, { minSamples: 1 });
assert.ok(leaders.length > 0 && leaders[0].matching.avgR >= leaders[leaders.length - 1].matching.avgR, 'leaders ranked by avg R');
assert.equal(factorValue({ Trend: '-' }, 'Trend'), 'inactive');
assert.equal(factorValue({ Trend: '1' }, 'Trend'), 'passed');
assert.equal(factorValue({ Trend: '0' }, 'Trend'), 'failed');

// --- 7) Analytics equity events use signalAt -----------------------------------
const { buildAccountAnalyticsSnapshot } = require('../lib/engines/analytics');
const analyticsState = store.initial();
analyticsState.accounts = [{ id: 'a1', capital: 1000, currentBalance: 1000 }];
analyticsState.trades = [{
  accountId: 'a1',
  backtestId: 'bt-1',
  source: 'BACKTEST_MANUAL',
  symbol: 'XAUUSD',
  side: 'Buy',
  session: 'London',
  date: '2026-07-21',
  resultR: 2,
}];
analyticsState.openPositions = [];
analyticsState.backtests = [{
  id: 'bt-1',
  accountId: 'a1',
  name: 't',
  status: 'ACTIVE',
  filters: { symbol: 'XAUUSD', tf: '15m' },
}];
analyticsState.backtestSignals = [
  // Deliberately unsorted input: the 22nd arrives before the 20th.
  { backtestId: 'bt-1', status: 'LOSS', resultR: -1, signalAt: '2026-07-22T12:00:00.000Z', importedAt: '2026-07-30T00:00:00.000Z', Instrument: 'XAU/USD', Direction: '+Cisd', Session: 'London' },
  { backtestId: 'bt-1', status: 'WIN', resultR: 1, signalAt: '2026-07-20T12:00:00.000Z', importedAt: '2026-07-30T00:00:00.000Z', Instrument: 'XAU/USD', Direction: '+Cisd', Session: 'London' },
  { backtestId: 'bt-1', status: 'WIN', resultR: null, signalAt: '2026-07-21T12:00:00.000Z', importedAt: '2026-07-30T00:00:00.000Z', Instrument: 'XAU/USD', Direction: '+Cisd', Session: 'London' },
];
const snapshot = buildAccountAnalyticsSnapshot(analyticsState, 'a1', { timezone: 'America/New_York' });
const backtestEvents = (snapshot.events || []).filter((event) => event.kind === 'backtest');
assert.ok(backtestEvents.length === 2, 'both graded signals produce analytics events');
assert.ok(
  backtestEvents[0].at < backtestEvents[1].at && backtestEvents[0].at.startsWith('2026-07-20'),
  'event ordering follows signalAt (20th then 22nd), not the shared import instant (30th)'
);
assert.ok(backtestEvents.every((event) => event.date.startsWith('2026-07-2') && !event.date.endsWith('30')), 'event dates come from signalAt, not importedAt');
const comparison = snapshot.backtestComparison.find((item) => item.id === 'bt-1');
assert.equal(comparison.symbol, 'XAUUSD', 'backtest comparison reads symbol/timeframe from session filters');
assert.equal(comparison.timeframe, '15m');
assert.equal(comparison.reviewed, 2, 'legacy scored statuses without an R result stay out of comparison math');
assert.equal(comparison.manualTrades, 1, 'manual trades are attached to the backtest session');
assert.equal(comparison.executedTrades, 3, 'signal reviews and manual trades form one session comparison');
assert.equal(comparison.netResult, 2, 'manual R is included once in the backtest comparison');

console.log('Backtest Upgrade QA: PASS (NY-time/DST parsing, symbol/session normalization, decisions bridge, factor attribution, signalAt analytics)');
