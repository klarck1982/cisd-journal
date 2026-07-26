const assert = require('assert');
const { buildAccountDashboardSnapshot } = require('../lib/engines/account-dashboard');

const data = {
  accounts: [{ id: 'a', capital: 100000, currentBalance: 101500, profitTarget: 10, dailyLoss: 3, maxDrawdown: 10 }],
  trades: [
    { id: 'T1', accountId: 'a', signalId: 'S1', resultR: 1.2, netProfit: 200, date: '2026-07-26' },
    { id: 'T2', accountId: 'a', signalId: '', resultR: -0.4, netProfit: -100, date: '2026-07-25' },
  ],
  openPositions: [{ accountId: 'a', netProfit: 50 }],
  signals: [
    { SignalID: 'S1', Instrument: 'XAUUSD', Direction: '+CISD', TF: '15m', Session: 'London', mode: 'LIVE', decisions: { a: { status: 'ORDER_PLACED' } }, importedAt: '2026-07-26T08:00:00Z' },
    { SignalID: 'S2', Instrument: 'EURUSD', Direction: '-CISD', TF: '5m', Session: 'New York', mode: 'LIVE', decisions: { a: { status: 'MISSED', reason: 'hesitation' } }, importedAt: '2026-07-26T10:00:00Z' },
  ],
};

const snapshot = buildAccountDashboardSnapshot(data, 'a', { risk: { today: '2026-07-26' } });
assert.equal(snapshot.accountId, 'a');
assert.equal(snapshot.discipline.totals.signals, 2);
assert.equal(snapshot.discipline.totals.executed, 1);
assert.equal(snapshot.risk.balances.equity, 101550);
assert.equal(snapshot.risk.state, 'SAFE');
assert.ok(snapshot.generatedAt);

console.log('Dashboard Snapshot QA: PASS (discipline + risk aggregation)');
