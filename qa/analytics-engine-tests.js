const assert = require('assert');
const { buildAccountAnalyticsSnapshot } = require('../lib/engines/analytics');

const data = {
  accounts: [{ id: 'a' }],
  backtests: [{ id: 'BT-SESSION-1', accountId: 'a', name: 'London Gold', type: 'Gold', symbol: 'XAUUSD', tf: '15m' }],
  trades: [
    { id: 'T1', accountId: 'a', signalId: 'S1', source: 'Manual', symbol: 'XAUUSD', side: 'Buy', resultR: 1.5, netProfit: 150, tags: 'CISD, London', openTime: '2026-07-25 07:30', createdAt: '2026-07-25T07:35:00Z', date: '2026-07-25' },
    { id: 'T2', accountId: 'a', signalId: '', source: 'Manual', symbol: 'US30', side: 'Sell', resultR: -1, netProfit: -100, tags: 'Manual, News', openTime: '2026-07-25 09:10', createdAt: '2026-07-25T09:12:00Z', date: '2026-07-25' },
    { id: 'T3', accountId: 'a', signalId: '', source: 'MT5 Report', symbol: 'EURUSD', side: 'Buy', resultR: 0.5, netProfit: 50, tags: 'Swing', openTime: '2026-07-26 18:10', createdAt: '2026-07-26T18:12:00Z', date: '2026-07-26' },
    { id: 'T4', accountId: 'a', signalId: '', source: 'FundedNext CSV', symbol: 'BTCUSD', side: 'Buy', resultR: 0, netProfit: 0, tags: 'CISD', openTime: '2026-07-26 05:45', createdAt: '2026-07-26T05:47:00Z', date: '2026-07-26' },
    { id: 'T5', accountId: 'b', signalId: 'OTHER', source: 'Manual', symbol: 'XAUUSD', side: 'Buy', resultR: 3, netProfit: 300, tags: 'Ignored', openTime: '2026-07-25 07:00', createdAt: '2026-07-25T07:01:00Z', date: '2026-07-25' }
  ],
  signals: [],
  backtestSignals: [
    { id: 'BT1-OCC', SignalID: 'BT1', backtestId: 'BT-SESSION-1', status: 'WIN', resultR: 2, Session: 'London', Instrument: 'XAUUSD', Direction: '+CISD', importedAt: '2026-07-24T08:00:00Z' },
    { id: 'BT2-OCC', SignalID: 'BT2', backtestId: 'BT-SESSION-1', status: 'LOSS', resultR: -1, Session: 'New York', Instrument: 'EURUSD', Direction: '-CISD', importedAt: '2026-07-24T14:00:00Z' },
    { id: 'BT3-OCC', SignalID: 'BT3', backtestId: 'BT-SESSION-1', status: 'BE', resultR: 0, Session: 'New York', Instrument: 'US30', Direction: '+CISD', importedAt: '2026-07-24T15:00:00Z' },
    { id: 'BT4-OCC', SignalID: 'BT4', backtestId: 'OTHER', status: 'WIN', resultR: 5, Session: 'London', Instrument: 'XAUUSD', Direction: '+CISD', importedAt: '2026-07-24T09:00:00Z' }
  ]
};

const snapshot = buildAccountAnalyticsSnapshot(data, 'a');
assert.equal(snapshot.totals.count, 7);
assert.equal(snapshot.totals.wins, 3);
assert.equal(snapshot.totals.losses, 2);
assert.equal(snapshot.totals.breakeven, 2);
assert.equal(snapshot.totals.net, 2);
assert.equal(Number(snapshot.totals.average.toFixed(4)), 0.2857);
assert.equal(snapshot.totals.profitFactor, 2);
assert.equal(Number(snapshot.totals.avgWin.toFixed(4)), 1.3333);
assert.equal(snapshot.totals.avgLoss, -1);
assert.equal(Number(snapshot.totals.payoffRatio.toFixed(4)), 1.3333);
assert.equal(snapshot.totals.maxDrawdown, -1);
assert.equal(snapshot.totals.currentDrawdown, -0.5);
assert.equal(snapshot.totals.consecutiveWins, 1);
assert.equal(snapshot.totals.consecutiveLosses, 1);
assert.equal(snapshot.totals.currentStreak.type, 'win');
assert.equal(snapshot.totals.currentStreak.count, 1);
assert.equal(snapshot.availableFilters.sources.join(','), 'backtest,cisd,imported,manual');
assert.equal(snapshot.breakdowns.bySource.find((item) => item.label === 'backtest').count, 3);
assert.equal(snapshot.breakdowns.bySource.find((item) => item.label === 'cisd').net, 1.5);
assert.equal(snapshot.breakdowns.byTag.find((item) => item.label === 'CISD').count, 2);
assert.equal(snapshot.heatmap.reduce((sum, cell) => sum + cell.count, 0), 7);
assert.equal(snapshot.backtestComparison.length, 1);
assert.equal(snapshot.backtestComparison[0].reviewed, 3);
assert.equal(snapshot.backtestComparison[0].netResult, 1);

const backtestOnly = buildAccountAnalyticsSnapshot(data, 'a', { source: 'backtest' });
assert.equal(backtestOnly.totals.count, 3);
assert.equal(backtestOnly.totals.net, 1);

const instrumentFiltered = buildAccountAnalyticsSnapshot(data, 'a', { instrument: 'XAUUSD' });
assert.equal(instrumentFiltered.totals.count, 2);
assert.equal(instrumentFiltered.totals.net, 3.5);

const sessionFiltered = buildAccountAnalyticsSnapshot(data, 'a', { session: 'New York' });
assert.equal(sessionFiltered.totals.count, 3);
assert.equal(sessionFiltered.totals.net, -2);

const todayFiltered = buildAccountAnalyticsSnapshot(data, 'a', { period: 'today', now: '2026-07-26T20:00:00Z' });
assert.equal(todayFiltered.totals.count, 2);
assert.equal(todayFiltered.totals.net, 0.5);

console.log('Analytics Engine QA: PASS (summary metrics, filters, breakdowns, backtest comparison)');
