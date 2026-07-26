const crypto = require('crypto');
const path = require('path');

const { fundedNext, mt5 } = require('./importers');
const { syncSignals, importBacktestSignals } = require('./cisd-signals');

function compactDiagnostics(diagnostics) {
  return {
    totalRows: diagnostics.totalRows || 0,
    scannedRows: diagnostics.scannedRows || 0,
    added: diagnostics.added || 0,
    duplicates: diagnostics.duplicates || 0,
    skippedRows: diagnostics.skippedRows || 0,
    invalidRows: diagnostics.invalidRows || 0,
    openPositions: diagnostics.openPositions || 0,
    format: diagnostics.format || '',
  };
}

function buildFingerprint(entry) {
  return JSON.stringify({
    source: entry.source,
    sourceType: entry.sourceType,
    accountId: entry.accountId || null,
    file: entry.file || '',
    summary: compactDiagnostics(entry.diagnostics || {}),
  });
}

function appendImportHistory(data, entry, options = {}) {
  data.importHistory = data.importHistory || [];
  const fingerprint = buildFingerprint(entry);
  const recentWindow = options.recentWindow || 10;

  if (data.importHistory.slice(0, recentWindow).some((item) => item.fingerprint === fingerprint)) {
    return null;
  }

  const record = {
    id: crypto.randomUUID(),
    at: new Date().toISOString(),
    fingerprint,
    ...entry,
  };

  data.importHistory.unshift(record);
  if (data.importHistory.length > 250) data.importHistory.length = 250;
  return record;
}

function normalizeFileName(file) {
  return file ? path.basename(file) : '';
}

function importFundedNextText(data, text, accountId, file, options = {}) {
  const result = fundedNext(data, text, accountId, normalizeFileName(file));
  const executedAt = new Date().toISOString();
  const account = data.accounts.find((item) => item.id === accountId);
  if (account) {
    account.lastFundedNextImport = executedAt;
    account.lastFundedNextDiagnostics = result.diagnostics;
    delete account.lastFundedNextError;
  }

  const shouldRecord =
    options.recordNoop !== false ||
    result.added > 0 ||
    result.diagnostics.openPositions > 0 ||
    result.diagnostics.invalidRows > 0 ||
    result.diagnostics.skippedRows > 0 ||
    result.diagnostics.warnings.length > 0;

  const importEntry = shouldRecord
    ? appendImportHistory(
        data,
        {
          source: 'FundedNext CSV',
          sourceType: 'trade',
          accountId,
          file: normalizeFileName(file),
          added: result.added,
          diagnostics: result.diagnostics,
        },
        options
      )
    : null;

  return { ...result, importEntry, executedAt };
}

function importMT5Text(data, text, accountId, file, isHtml, options = {}) {
  const result = mt5(data, text, accountId, normalizeFileName(file), isHtml);
  const executedAt = new Date().toISOString();
  const account = data.accounts.find((item) => item.id === accountId);
  if (account) {
    account.lastMT5Import = executedAt;
    account.lastMT5Diagnostics = result.diagnostics;
    delete account.lastMT5Error;
  }

  const shouldRecord =
    options.recordNoop !== false ||
    result.added > 0 ||
    result.diagnostics.invalidRows > 0 ||
    result.diagnostics.skippedRows > 0 ||
    result.diagnostics.warnings.length > 0;

  const importEntry = shouldRecord
    ? appendImportHistory(
        data,
        {
          source: 'MT5 Report',
          sourceType: 'trade',
          accountId,
          file: normalizeFileName(file),
          added: result.added,
          diagnostics: result.diagnostics,
        },
        options
      )
    : null;

  return { ...result, importEntry, executedAt };
}

function importCisdSignalsText(data, text, file, options = {}) {
  const result = syncSignals(data, text, options);
  const executedAt = new Date().toISOString();
  data.settings = data.settings || {};
  data.settings.lastSignalSync = executedAt;
  data.settings.lastSignalDiagnostics = result.diagnostics;

  const shouldRecord = options.recordNoop !== false || result.count > 0 || result.diagnostics.invalidRows > 0;
  const importEntry = shouldRecord
    ? appendImportHistory(
        data,
        {
          source: 'CISD CSV',
          sourceType: 'signal',
          accountId: null,
          file: normalizeFileName(file),
          added: result.count,
          diagnostics: result.diagnostics,
          mode: result.mode,
        },
        options
      )
    : null;

  return { ...result, importEntry, executedAt };
}

function importBacktestSignalsText(data, text, backtest, file, options = {}) {
  const result = importBacktestSignals(data, text, backtest, options);
  const executedAt = new Date().toISOString();
  const entry = appendImportHistory(
    data,
    {
      source: 'CISD Backtest CSV',
      sourceType: 'backtest-signal',
      accountId: backtest.accountId,
      file: normalizeFileName(file),
      added: result.count,
      diagnostics: result.diagnostics,
      mode: result.mode,
      backtestId: backtest.id,
    },
    options
  );

  return { ...result, importEntry: entry, executedAt };
}

module.exports = {
  appendImportHistory,
  importFundedNextText,
  importMT5Text,
  importCisdSignalsText,
  importBacktestSignalsText,
};
