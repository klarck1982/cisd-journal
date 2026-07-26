const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { importFundedNextText, importMT5Text, importCisdSignalsText } = require('../lib/import-engine');
const { createStore } = require('../lib/store');

const fixtures = path.join(__dirname, 'fixtures');
const app = { getPath: () => fixtures };
const store = createStore(app);

function freshState() {
  const state = store.initial();
  state.importHistory = [];
  return state;
}

function testFundedNextDiagnostics() {
  const state = freshState();
  const csv = fs.readFileSync(path.join(fixtures, 'fundednext-sample.csv'), 'utf8');
  const result = importFundedNextText(state, csv, 'fundednext', 'fundednext-sample.csv');

  assert.equal(result.added, 1);
  assert.equal(result.diagnostics.openPositions, 1);
  assert.equal(result.diagnostics.duplicates, 1);
  assert.equal(result.diagnostics.invalidRows, 1);
  assert.equal(state.importHistory[0].source, 'FundedNext CSV');
  assert.equal(state.importHistory[0].diagnostics.added, 1);
}

function testMt5DiagnosticsAcrossFormats() {
  const state = freshState();
  const csv = fs.readFileSync(path.join(fixtures, 'mt5-sample.csv'), 'utf8');
  const html = fs.readFileSync(path.join(fixtures, 'mt5-sample.html'), 'utf8');

  const csvResult = importMT5Text(state, csv, 'fundingpips', 'mt5-sample.csv', false);
  assert.equal(csvResult.added, 2);
  assert.equal(csvResult.diagnostics.skippedRows, 1);
  assert.equal(csvResult.diagnostics.format, 'csv');

  const htmlResult = importMT5Text(state, html, 'fundingpips', 'mt5-sample.html', true);
  assert.equal(htmlResult.added, 1);
  assert.equal(htmlResult.diagnostics.format, 'html');
  assert.equal(state.importHistory.length, 2);
}

function testSignalImportDiagnosticsAndHistoryDedupe() {
  const state = freshState();
  const csv = fs.readFileSync(path.join(fixtures, 'cisd-signals.csv'), 'utf8');

  const first = importCisdSignalsText(state, csv, 'cisd-signals.csv', { recordNoop: true });
  assert.equal(first.count, 2);
  assert.equal(first.diagnostics.invalidRows, 1);
  assert.equal(state.importHistory[0].sourceType, 'signal');

  const second = importCisdSignalsText(state, csv, 'cisd-signals.csv', { recordNoop: true });
  assert.equal(second.count, 0);
  assert.equal(second.diagnostics.duplicates, 2);
  assert.equal(state.importHistory.length, 2);

  const third = importCisdSignalsText(state, csv, 'cisd-signals.csv', { recordNoop: true });
  assert.equal(state.importHistory.length, 2);
}

testFundedNextDiagnostics();
testMt5DiagnosticsAcrossFormats();
testSignalImportDiagnosticsAndHistoryDedupe();
console.log('Import Engine QA: PASS (fixtures, diagnostics, history, CSV/HTML sources)');
