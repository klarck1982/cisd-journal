const crypto = require('crypto');
const { rowsFromCSV } = require('./importers');

const NY_ZONE = 'America/New_York';

function normalizeCell(value) {
  return String(value ?? '').trim();
}

function parseCisdCsv(text) {
  const rows = rowsFromCSV(String(text || '').replace(/^﻿/, ''));
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

/**
 * Converts a wall-clock reading in a given IANA zone (e.g. "2026-07-24 22:30"
 * in America/New_York) into the matching UTC instant.
 *
 * The indicator writes SignalTimeNY as a *New York wall clock* string. The old
 * parser handed that string to `new Date(...)`, which reads it in the machine's
 * local zone — so a signal stamped 22:30 NY was stored as 22:30 in whatever
 * timezone the trader's PC happened to use, corrupting both the stored
 * `signalAt` and the occurrence de-dup key.
 *
 * The conversion is done by iteratively measuring the zone offset at the
 * guessed instant, which handles EST/EDT daylight-saving transitions without a
 * lookup table.
 */
function zonedWallClockToUtc(parts, timeZone = NY_ZONE) {
  const [year, month, day, hour, minute, second] = parts;
  const targetAsUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let instant = targetAsUtc;
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

  for (let i = 0; i < 3; i += 1) {
    const fields = {};
    for (const part of dtf.formatToParts(new Date(instant))) {
      if (part.type !== 'literal') fields[part.type] = Number(part.value);
    }
    const zoneWallAsUtc = Date.UTC(
      fields.year,
      fields.month - 1,
      fields.day,
      fields.hour % 24,
      fields.minute,
      fields.second
    );
    const next = targetAsUtc - (zoneWallAsUtc - instant);
    if (next === instant) break;
    instant = next;
  }

  return new Date(instant);
}

const WALL_CLOCK_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})[T ](\d{1,2}):(\d{2})(?::(\d{1,2}))?/;

function parseNyWallClock(value, timeZone = NY_ZONE) {
  const text = String(value || '').trim();
  if (!text) return null;

  // Absolute instants (with Z or an explicit offset) are parsed as-is.
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(text)) {
    const absolute = new Date(text);
    return Number.isNaN(absolute.getTime()) ? null : absolute;
  }

  const match = text.match(WALL_CLOCK_RE);
  if (match) {
    return zonedWallClockToUtc(
      [
        Number(match[1]),
        Number(match[2]),
        Number(match[3]),
        Number(match[4]),
        Number(match[5]),
        Number(match[6] || 0),
      ],
      timeZone
    );
  }

  // Date-only ("2026-07-24") → start of that day in New York.
  const dateOnly = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dateOnly) {
    return zonedWallClockToUtc([Number(dateOnly[1]), Number(dateOnly[2]), Number(dateOnly[3]), 0, 0, 0], timeZone);
  }

  const fallback = new Date(text.replace(' ', 'T'));
  return Number.isNaN(fallback.getTime()) ? null : fallback;
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
    const date = parseNyWallClock(candidate);
    if (date) return date;
  }

  return null;
}

function parseWaveStartTimestamp(signal) {
  const candidate = signal.WaveStartTimeNY || signal.WaveStart || '';
  return candidate ? parseNyWallClock(candidate) : null;
}

function normalizeSession(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return '';
  if (text.includes('new york') || text.includes('newyork') || text === 'ny') return 'new york';
  if (text.includes('london')) return 'london';
  if (text.includes('asia')) return 'asia';
  if (text.includes('after') || text.includes('closed')) return 'after';
  return text;
}

function normalizeSymbol(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function arrayify(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === '') return [];
  return [value];
}

/**
 * Backtest periods mean "the New York calendar day", matching what the trader
 * picked in the JForex replay widget. Boundaries are built as NY wall-clock
 * instants so a machine in any timezone filters identically.
 */
function startOfNyDay(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    return zonedWallClockToUtc([Number(match[1]), Number(match[2]), Number(match[3]), 0, 0, 0]);
  }
  return parseNyWallClock(text);
}

function endOfNyDay(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    // Do not add a fixed 24 hours here: New York calendar days are 23 or 25
    // hours across DST transitions. Advance the *calendar date* in UTC, then
    // convert the next local midnight back to an instant.
    const nextDay = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + 1));
    const nextMidnight = zonedWallClockToUtc([
      nextDay.getUTCFullYear(),
      nextDay.getUTCMonth() + 1,
      nextDay.getUTCDate(),
      0,
      0,
      0,
    ]);
    return new Date(nextMidnight.getTime() - 1);
  }
  return parseNyWallClock(text);
}

function matchesBacktestFilters(signal, filters = {}) {
  const timestamp = parseSignalTimestamp(signal);
  if (!timestamp) return false;

  const start = startOfNyDay(filters.start || filters.startDate);
  const end = endOfNyDay(filters.end || filters.endDate);
  if (start && timestamp < start) return false;
  if (end && timestamp > end) return false;

  const sessionFilters = arrayify(filters.sessions || filters.session).map(normalizeSession);
  if (sessionFilters.length && !sessionFilters.includes(normalizeSession(signal.Session))) return false;

  const symbolFilters = arrayify(filters.symbols || filters.symbol).map(normalizeSymbol);
  if (symbolFilters.length && !symbolFilters.includes(normalizeSymbol(signal.Instrument))) return false;

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

    const signalAt = parseSignalTimestamp(signal);
    const normalized = {
      ...signal,
      status: 'NEW',
      decisions: {},
      mode,
      importedAt: new Date().toISOString(),
      signalAt: signalAt?.toISOString() || '',
      waveStartAt: parseWaveStartTimestamp(signal)?.toISOString() || '',
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
      waveStartAt: parseWaveStartTimestamp(signal)?.toISOString() || '',
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
  NY_ZONE,
  parseCisdCsv,
  parseNyWallClock,
  zonedWallClockToUtc,
  parseSignalTimestamp,
  parseWaveStartTimestamp,
  normalizeSession,
  normalizeSymbol,
  startOfNyDay,
  endOfNyDay,
  matchesBacktestFilters,
  syncSignals,
  importBacktestSignals,
};
