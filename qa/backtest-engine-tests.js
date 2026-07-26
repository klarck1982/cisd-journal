const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { importBacktestSignalsText } = require('../lib/import-engine');
const { createStore } = require('../lib/store');

const fixtures = path.join(__dirname, 'fixtures');
const store = createStore({ getPath: () => fixtures });

function freshState() {
  const state = store.initial();
  state.importHistory = [];
  state.backtestSignals = [];
  state.backtests = [];
  return state;
}

function testBacktestFilteringAndDedup() {
  const state = freshState();
  const csv = fs.readFileSync(path.join(fixtures, 'cisd-signals.csv'), 'utf8');
  const backtest = {
    id: 'bt-1',
    accountId: 'fundingpips',
    filters: {
      start: '2026-07-24',
      end: '2026-07-24',
      session: 'London',
      symbol: 'XAUUSD',
      tf: '15m',
    },
  };

  let result = importBacktestSignalsText(state, csv, backtest, 'cisd-signals.csv', { recordNoop: true });
  assert.equal(result.count, 1);
  assert.equal(result.diagnostics.skippedRows, 1);
  assert.equal(result.diagnostics.invalidRows, 1);
  assert.equal(state.backtestSignals.length, 1);
  assert.equal(state.backtestSignals[0].baseSignalId, 'SIG-1001');
  assert.equal(state.importHistory[0].sourceType, 'backtest-signal');

  result = importBacktestSignalsText(state, csv, backtest, 'cisd-signals.csv', { recordNoop: true });
  assert.equal(result.count, 0);
  assert.equal(result.diagnostics.duplicates, 1);
  assert.equal(state.backtestSignals.length, 1);
}

testBacktestFilteringAndDedup();
console.log('Backtest Engine QA: PASS (time range, session, symbol, TF filters, de-duplication)');
