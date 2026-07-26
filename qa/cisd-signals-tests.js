const assert = require('assert');
const { parseCisdCsv, syncSignals, importBacktestSignals } = require('../lib/cisd-signals');

function testQuotedCsvParsing() {
  const csv = 'SignalID,Instrument,Direction,Note\nSIG-1,XAUUSD,+CISD,"hesitation, but valid"';
  const parsed = parseCisdCsv(csv);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].SignalID, 'SIG-1');
  assert.equal(parsed.rows[0].Note, 'hesitation, but valid');
}

function testSignalSyncAndDedup() {
  const data = { signals: [], activeBacktestId: null };
  const csv = 'SignalID,Instrument,Direction,TF,Session\nSIG-1,XAUUSD,+CISD,15m,London\nSIG-2,EURUSD,-CISD,5m,New York';

  let result = syncSignals(data, csv);
  assert.equal(result.count, 2);
  assert.equal(data.signals.length, 2);
  assert.equal(data.signals[0].mode, 'LIVE');

  result = syncSignals(data, csv);
  assert.equal(result.count, 0);
  assert.equal(data.signals.length, 2);
}

function testBacktestMode() {
  const data = { signals: [], backtestSignals: [] };
  const csv = 'SignalID,Instrument,Direction,TF,Session,SignalTimeNY\nSIG-3,US30,+CISD,1m,New York,2026-07-24 11:00';
  importBacktestSignals(data, csv, { id: 'bt-1', accountId: 'a', filters: { start: '2026-07-24', end: '2026-07-24', session: 'New York', symbol: 'US30', tf: '1m' } });
  assert.equal(data.backtestSignals[0].mode, 'BACKTEST');
  assert.equal(data.backtestSignals[0].backtestId, 'bt-1');
}

testQuotedCsvParsing();
testSignalSyncAndDedup();
testBacktestMode();
console.log('CISD Signal QA: PASS (CSV parsing, de-duplication, backtest/live modes)');
