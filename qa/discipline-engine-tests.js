const assert = require('assert');
const { buildDisciplineSnapshot } = require('../lib/engines/discipline');

const data = {
  signals: [
    { SignalID: 'S1', Instrument: 'XAUUSD', Direction: '+CISD', TF: '15m', Session: 'London', mode: 'LIVE', importedAt: '2026-07-25T08:00:00Z', decisions: { a: { status: 'ORDER_PLACED', updatedAt: '2026-07-25T08:01:00Z' } } },
    { SignalID: 'S2', Instrument: 'EURUSD', Direction: '-CISD', TF: '5m', Session: 'New York', mode: 'LIVE', importedAt: '2026-07-25T10:00:00Z', decisions: { a: { status: 'MISSED', reason: 'fear', updatedAt: '2026-07-25T10:02:00Z' } } },
    { SignalID: 'S3', Instrument: 'US30', Direction: '+CISD', TF: '1m', Session: 'New York', mode: 'LIVE', importedAt: '2026-07-25T11:00:00Z', decisions: { a: { status: 'ORDER_PLACED', updatedAt: '2026-07-25T11:01:00Z' } } },
    { SignalID: 'S4', Instrument: 'BTCUSD', Direction: '+CISD', TF: '15m', Session: 'After', mode: 'LIVE', importedAt: '2026-07-25T12:00:00Z', decisions: {} }
  ],
  backtestSignals: [
    { id: 'BT1-OCC', SignalID: 'BT1', Instrument: 'XAUUSD', Direction: '+CISD', TF: '15m', Session: 'London', mode: 'BACKTEST', status: 'WIN', importedAt: '2026-07-25T13:00:00Z', reviewedAt: '2026-07-25T13:10:00Z' },
    { id: 'BT2-OCC', SignalID: 'BT2', Instrument: 'EURUSD', Direction: '-CISD', TF: '5m', Session: 'New York', mode: 'BACKTEST', status: 'MISSED', importedAt: '2026-07-25T14:00:00Z', reviewedAt: '2026-07-25T14:05:00Z', reviewNote: 'late' }
  ],
  trades: [
    { id: 'T1', accountId: 'a', signalId: 'S1', resultR: 1.5, netProfit: 150 },
    { id: 'T2', accountId: 'a', signalId: '', resultR: -0.5, netProfit: -40 },
    { id: 'T3', accountId: 'b', signalId: 'S3', resultR: 2, netProfit: 200 },
  ],
};

const live = buildDisciplineSnapshot(data, 'a');
assert.equal(live.totals.signals, 4);
assert.equal(live.totals.decided, 3);
assert.equal(live.totals.executed, 2);
assert.equal(live.totals.missed, 1);
assert.equal(live.totals.pending, 1);
assert.equal(live.totals.linkedTrades, 1);
assert.equal(live.totals.executedWithoutTradeLink, 1);
assert.equal(live.reasons[0].reason, 'fear');
assert.equal(live.reasons[0].count, 1);
assert.equal(live.linkedPerformance.count, 1);
assert.equal(live.linkedPerformance.wins, 1);
assert.equal(live.linkedPerformance.averageResult, 1.5);
assert.equal(live.rates.decisionCoverage, 0.75);
assert.equal(live.rates.executionRate, 0.5);
assert.equal(live.rates.linkRate, 0.5);
assert.equal(live.score, 65.83);

const backtest = buildDisciplineSnapshot(data, 'a', { mode: 'BACKTEST' });
assert.equal(backtest.totals.signals, 2);
assert.equal(backtest.totals.executed, 1);
assert.equal(backtest.totals.missed, 1);
assert.equal(backtest.executedSignals[0].outcome, 'WIN');
assert.equal(backtest.missedSignals[0].reason, 'late');

console.log('Discipline Engine QA: PASS (coverage, missed reasons, linked trades, backtest handling)');
