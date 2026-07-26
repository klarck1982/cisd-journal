const crypto = require('crypto');
const { rowsFromCSV } = require('./importers');

function normalizeCell(value) {
  return String(value ?? '').trim();
}

function parseCisdCsv(text) {
  const rows = rowsFromCSV(String(text || '').replace(/^\uFEFF/, ''));
  if (rows.length < 2) return { headers: [], rows: [] };

  const headers = rows.shift().map(normalizeCell);
  const records = rows.map((row) => {
    const record = {};
    headers.forEach((header, index) => {
      record[header] = normalizeCell(row[index]);
    });
    return record;
  });

  return { headers, rows: records };
}

function createDiagnostics(totalRows, source = 'CISD CSV') {
  return {
    source,
    format: 'csv',
    totalRows,
    scannedRows: 0,
    added: 0,
    duplicates: 0,
    skippedRows: 0,
    invalidRows: 0,
    warnings: [],
  };
}

function pushWarning(diagnostics, code, row, message) {
  if (diagnostics.warnings.length >= 8) return;
  diagnostics.warnings.push({ code, row, message });
}

function parseSignalTimestamp(signal) {
  const candidates = [
    signal.SignalTimeNY,
    signal.SignalTime,
    signal.Date,
    signal.date,
    signal.Time,
    signal.time,
  ].filter(Boolean);

  for (const candidate of candidates) {
    const normalized = String(candidate).replace(' ', 'T');
    const date = new Date(normalized);
    if (!Number.isNaN(date.getTime())) return date;
  }

  return null;
}

function normalizeSession(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('new york') || text.includes('newyork') || text === 'ny') return 'new york';
  if (text.includes('london')) return 'london';
  if (text.includes('after')) return 'after';
  return text;
}

function arrayify(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

function startOfDay(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Date(`${value}T00:00:00`);
  return new Date(value);
}

function endOfDay(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) return new Date(`${value}T23:59:59.999`);
  return new Date(value);
}

function matchesBacktestFilters(signal, filters = {}) {
  const timestamp = parseSignalTimestamp(signal);
  if (!timestamp) return false;

  const start = startOfDay(filters.start || filters.startDate);
  const end = endOfDay(filters.end || filters.endDate);
  if (start && timestamp < start) return false;
  if (end && timestamp > end) return false;

  const sessionFilters = arrayify(filters.sessions || filters.session).map(normalizeSession);
  if (sessionFilters.length && !sessionFilters.includes(normalizeSession(signal.Session))) return false;

  const symbolFilters = arrayify(filters.symbols || filters.symbol).map((value) => String(value).trim().toUpperCase());
  if (symbolFilters.length && !symbolFilters.includes(String(signal.Instrument || '').trim().toUpperCase())) return false;

  const timeframeFilters = arrayify(filters.timeframes || filters.tf).map((value) => String(value).trim().toLowerCase());
  if (timeframeFilters.length && !timeframeFilters.includes(String(signal.TF || '').trim().toLowerCase())) return false;

  return true;
}

function syncSignals(data, csvText, options = {}) {
  const parsed = parseCisdCsv(csvText);
  const diagnostics = createDiagnostics(parsed.rows.length, 'CISD CSV');
  const mode = 'LIVE';
  const added = [];

  for (const signal of parsed.rows) {
    diagnostics.scannedRows++;
    if (!signal.SignalID) {
      diagnostics.invalidRows++;
      pushWarning(diagnostics, 'MISSING_SIGNAL_ID', diagnostics.scannedRows + 1, 'SignalID is required');
      continue;
    }

    if (data.signals.some((existing) => existing.SignalID === signal.SignalID)) {
      diagnostics.duplicates++;
      continue;
    }

    const normalized = {
      ...signal,
      status: 'NEW',
      decisions: {},
      mode,
      importedAt: new Date().toISOString(),
      signalAt: parseSignalTimestamp(signal)?.toISOString() || '',
    };

    data.signals.push(normalized);
    added.push(normalized);
  }

  diagnostics.added = added.length;
  return {
    headers: parsed.headers,
    added,
    count: added.length,
    mode,
    diagnostics,
  };
}

function importBacktestSignals(data, csvText, backtest, options = {}) {
  const parsed = parseCisdCsv(csvText);
  const diagnostics = createDiagnostics(parsed.rows.length, 'CISD Backtest CSV');
  const added = [];
  data.backtestSignals = data.backtestSignals || [];

  for (const signal of parsed.rows) {
    diagnostics.scannedRows++;
    const rowNumber = diagnostics.scannedRows + 1;

    if (!signal.SignalID) {
      diagnostics.invalidRows++;
      pushWarning(diagnostics, 'MISSING_SIGNAL_ID', rowNumber, 'SignalID is required');
      continue;
    }

    const signalAt = parseSignalTimestamp(signal);
    if (!signalAt) {
      diagnostics.invalidRows++;
      pushWarning(diagnostics, 'INVALID_SIGNAL_TIME', rowNumber, 'Signal timestamp could not be parsed');
      continue;
    }

    if (!matchesBacktestFilters(signal, backtest.filters || backtest)) {
      diagnostics.skippedRows++;
      continue;
    }

    const occurrenceKey = `${backtest.id}:${signal.SignalID}:${signalAt.toISOString()}`;
    if (data.backtestSignals.some((existing) => existing.occurrenceKey === occurrenceKey)) {
      diagnostics.duplicates++;
      continue;
    }

    const occurrence = {
      ...signal,
      id: crypto.randomUUID(),
      occurrenceKey,
      baseSignalId: signal.SignalID,
      backtestId: backtest.id,
      accountId: backtest.accountId,
      mode: 'BACKTEST',
      status: 'NEW',
      resultR: null,
      reviewedAt: '',
      reviewNote: '',
      signalAt: signalAt.toISOString(),
      importedAt: new Date().toISOString(),
    };

    data.backtestSignals.push(occurrence);
    added.push(occurrence);
  }

  diagnostics.added = added.length;
  return {
    headers: parsed.headers,
    added,
    count: added.length,
    mode: 'BACKTEST',
    diagnostics,
  };
}

module.exports = {
  parseCisdCsv,
  parseSignalTimestamp,
  normalizeSession,
  matchesBacktestFilters,
  syncSignals,
  importBacktestSignals,
};
