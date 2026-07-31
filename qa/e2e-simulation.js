const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createStore } = require('../lib/store');
const { importFundedNextText, importMT5Text, importCisdSignalsText, importBacktestSignalsText } = require('../lib/import-engine');
const { buildAccountDashboardSnapshot } = require('../lib/engines/account-dashboard');
const { buildAccountAnalyticsSnapshot } = require('../lib/engines/analytics');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cisd-e2e-'));
const app = { getPath: () => dir };
const store = createStore(app);
let data = store.initial();

// Configure two independent accounts. New installations intentionally have no
// pre-created firm accounts, so the test creates the accounts explicitly.
data.accounts = [
  { id: 'fundingpips', firm: 'FundingPips', capital: 100000, currentBalance: 100000, dailyLoss: 3, maxDrawdown: 10, profitTarget: 10, currency: 'USD' },
  { id: 'fundednext', firm: 'FundedNext', capital: 50000, currentBalance: 50000, dailyLoss: 3, maxDrawdown: 6, profitTarget: 8, currency: 'USD' },
];

// FundedNext: one closed trade and one open position in the same CSV
const fn = `Ticket ID,Open Time,Open Price,Close Time,Close Price,Profit,Lots,Commission,Swap,Symbol,Type,SL,TP,Pips,Volume\nF-1,2026.07.24 10:00:00,4000,2026-07-24 11:00:00,4010,20,0.1,-1,0,XAUUSD,Buy,3980,4040,1000,10\nF-2,2026.07.24 10:05:00,20000,Currently Running,20020,-5,0.1,0,0,NDX100,Sell,20100,19800,-500,10`;
let result = importFundedNextText(data, fn, 'fundednext', 'fundednext.csv');
assert.equal(result.added, 1);
assert.equal(data.trades.length, 1);
assert.equal(data.openPositions.length, 1);
assert.equal(data.trades[0].netProfit, 19);
assert.equal(data.importHistory[0].diagnostics.openPositions, 1);

// Same import must not duplicate the closed deal
result = importFundedNextText(data, fn, 'fundednext', 'fundednext.csv');
assert.equal(data.trades.length, 1);
assert.equal(result.diagnostics.duplicates, 1);

// MT5 report goes to another account and must remain isolated
const mt = `Ticket,Open Time,Open Price,Close Time,Close Price,Profit,Volume,Commission,Swap,Symbol,Type,SL,TP\nM-1,2026-07-24 10:00,1.10,2026-07-24 11:00,1.11,10,0.1,-1,0,EURUSD,buy,1.09,1.12`;
result = importMT5Text(data, mt, 'fundingpips', 'mt5.csv', false);
assert.equal(result.added, 1);
assert.equal(data.trades.filter((item) => item.accountId === 'fundednext').length, 1);
assert.equal(data.trades.filter((item) => item.accountId === 'fundingpips').length, 1);
assert.equal(data.importHistory[0].source, 'MT5 Report');

// Simulate CISD signal imports and per-account decisions
const signalsCsv = `SignalID,Instrument,Direction,TF,Session,SignalTimeNY\nSIG-1,XAUUSD,+CISD,15m,London,2026-07-24 08:15\nSIG-2,EURUSD,-CISD,5m,New York,2026-07-24 10:20\nSIG-3,XAUUSD,+CISD,15m,London,2026-07-23 08:00`;
result = importCisdSignalsText(data, signalsCsv, 'signals.csv', { recordNoop: true });
assert.equal(result.count, 3);
const sig = data.signals.find((item) => item.SignalID === 'SIG-1');
sig.decisions = { fundingpips: { status: 'ORDER_PLACED' }, fundednext: { status: 'MISSED', reason: 'تردد' } };
assert.notEqual(sig.decisions.fundingpips.status, sig.decisions.fundednext.status);

// Backtest import from the same CSV with time/session/symbol/TF filters
const backtest = { id: 'bt-1', startingCapital: 100000, currentBalance: 100000, currency: 'USD', name: 'London Gold', filters: { start: '2026-07-24', end: '2026-07-24', session: 'London', symbol: 'XAUUSD', tf: '15m' } };
data.backtests.push(backtest);
result = importBacktestSignalsText(data, signalsCsv, backtest, 'signals.csv', { recordNoop: true });
assert.equal(result.count, 1);
assert.equal(data.backtestSignals.length, 1);
data.backtestSignals[0].status = 'WIN';
data.backtestSignals[0].resultR = 1;
data.backtestSignals[0].reviewedAt = new Date().toISOString();

// Persist and recover
store.save(data);
data = store.read();
assert.equal(data.trades.length, 2);
assert.equal(data.openPositions.length, 1);
assert.equal(data.signals.find((item) => item.SignalID === 'SIG-1').decisions.fundednext.reason, 'تردد');
assert.equal(data.backtestSignals.length, 1);
assert.ok(data.importHistory.some((item) => item.source === 'CISD CSV'));
assert.ok(data.importHistory.some((item) => item.source === 'CISD Backtest CSV'));

// Dashboard snapshot simulation
const snapshot = buildAccountDashboardSnapshot(data, 'fundednext', { risk: { today: '2026-07-24' } });
assert.equal(snapshot.discipline.totals.signals, 3);
assert.equal(snapshot.discipline.totals.missed, 1);
assert.equal(snapshot.discipline.totals.pending, 2);
assert.equal(snapshot.risk.openPositions.count, 1);
assert.ok(['SAFE', 'ATTENTION', 'BREACH'].includes(snapshot.risk.state));

const analytics = buildAccountAnalyticsSnapshot(data, 'fundednext');
assert.equal(analytics.totals.count, 1);
assert.equal(analytics.totals.net, 19);
assert.equal(analytics.breakdowns.bySource[0].label, 'imported');

// A standalone backtest must not leak into real-account analytics.
const realAccountAnalytics = buildAccountAnalyticsSnapshot(data, 'fundingpips', { source: 'backtest' });
assert.equal(realAccountAnalytics.totals.count, 0);

// Backup simulation
const backup = path.join(dir, 'backup.json');
fs.copyFileSync(path.join(dir, 'journal-data.json'), backup);
assert.ok(fs.existsSync(backup));

fs.rmSync(dir, { recursive: true, force: true });
console.log('E2E Simulation: PASS (accounts, imports, diagnostics, duplicates, open positions, signals, persistence, backup)');
