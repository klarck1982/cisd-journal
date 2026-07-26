const crypto = require('crypto');

function rowsFromCSV(text) {
  let out = [];
  let row = [];
  let cell = '';
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        quoted = !quoted;
      }
    } else if (c === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((c === '\n' || c === '\r') && !quoted) {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      if (row.some((x) => x.trim())) out.push(row);
      row = [];
      cell = '';
    } else {
      cell += c;
    }
  }

  row.push(cell);
  if (row.some((x) => x.trim())) out.push(row);
  return out;
}

const number = (value) => Number(String(value || '').replace(/[$,\s]/g, '')) || 0;
const dateKey = (value) => {
  const match = String(value || '').match(/(\d{4})[.\-](\d{2})[.\-](\d{2})/);
  return match ? `${match[1]}-${match[2]}-${match[3]}` : '';
};

function cleanHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function rowsFromHTML(text) {
  let rows = [];
  for (const tr of text.match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    let row = [];
    for (const td of tr.match(/<(?:td|th)[^>]*>[\s\S]*?<\/(?:td|th)>/gi) || []) row.push(cleanHtml(td));
    if (row.length) rows.push(row);
  }
  return rows;
}

function field(headers, names) {
  const normalizedHeaders = headers.map((value) => value.toLowerCase().replace(/[^a-z]/g, ''));
  for (const name of names) {
    const index = normalizedHeaders.indexOf(name.toLowerCase().replace(/[^a-z]/g, ''));
    if (index >= 0) return index;
  }
  return -1;
}

function createDiagnostics(source, format, totalRows) {
  return {
    source,
    format,
    totalRows,
    scannedRows: 0,
    added: 0,
    duplicates: 0,
    skippedRows: 0,
    invalidRows: 0,
    openPositions: 0,
    warnings: [],
  };
}

function warn(diagnostics, code, rowNumber, message) {
  if (diagnostics.warnings.length >= 8) return;
  diagnostics.warnings.push({ code, row: rowNumber, message });
}

function fundedNext(data, text, accountId, file) {
  const rows = rowsFromCSV(String(text || '').replace(/^\uFEFF/, ''));
  if (rows.length < 2) throw new Error('CSV فارغ');

  const headers = rows.shift().map((value) => value.trim());
  const indexOf = (key) => headers.indexOf(key);
  const required = ['Ticket ID', 'Open Time', 'Open Price', 'Close Time', 'Close Price', 'Profit', 'Lots', 'Commission', 'Swap', 'Symbol', 'Type'];

  if (required.some((key) => indexOf(key) < 0)) {
    throw new Error('هذا ليس FundedNext CSV بالتنسيق المتوقع');
  }

  const diagnostics = createDiagnostics('FundedNext CSV', 'csv', rows.length);
  let added = 0;

  rows.forEach((row, rowIndex) => {
    diagnostics.scannedRows++;
    const rowNumber = rowIndex + 2;
    const ticket = String(row[indexOf('Ticket ID')] || '').trim();
    const closeTime = String(row[indexOf('Close Time')] || '').trim();
    const symbol = String(row[indexOf('Symbol')] || '').trim();
    const side = String(row[indexOf('Type')] || '').trim();

    if (!ticket) {
      diagnostics.invalidRows++;
      warn(diagnostics, 'MISSING_TICKET', rowNumber, 'Ticket ID is required');
      return;
    }

    if (!symbol || !side) {
      diagnostics.invalidRows++;
      warn(diagnostics, 'MISSING_FIELDS', rowNumber, 'Symbol and Type are required');
      return;
    }

    const open = closeTime.toLowerCase().includes('currently running');
    const profit = number(row[indexOf('Profit')]);
    const commission = number(row[indexOf('Commission')]);
    const swap = number(row[indexOf('Swap')]);

    const base = {
      accountId,
      source: 'FundedNext CSV',
      ticket,
      openTime: row[indexOf('Open Time')],
      entry: number(row[indexOf('Open Price')]),
      profit,
      commission,
      swap,
      netProfit: profit + commission + swap,
      lots: number(row[indexOf('Lots')]),
      symbol,
      side,
      sl: number(row[indexOf('SL')]),
      tp: number(row[indexOf('TP')]),
      pips: number(row[indexOf('Pips')]),
      volume: number(row[indexOf('Volume')]),
    };

    if (open) {
      data.openPositions = data.openPositions || [];
      const position = { ...base, id: `fundednext-open:${ticket}`, importId: `fundednext-open:${ticket}` };
      const existingIndex = data.openPositions.findIndex((item) => item.importId === position.importId);
      if (existingIndex >= 0) data.openPositions[existingIndex] = position;
      else data.openPositions.push(position);
      diagnostics.openPositions++;
      return;
    }

    if (data.trades.some((trade) => trade.importId === `fundednext:${ticket}`)) {
      diagnostics.duplicates++;
      return;
    }

    data.openPositions = (data.openPositions || []).filter((item) => item.ticket !== ticket);
    data.trades.unshift({
      ...base,
      id: crypto.randomUUID(),
      importId: `fundednext:${ticket}`,
      closeTime,
      date: dateKey(closeTime || row[indexOf('Open Time')]),
      close: number(row[indexOf('Close Price')]),
      resultR: null,
      note: 'Imported from FundedNext CSV',
      tags: 'FundedNext',
    });
    added++;
  });

  diagnostics.added = added;
  return { added, headers, diagnostics, file };
}

function mt5(data, text, accountId, file, isHtml) {
  const rows = isHtml ? rowsFromHTML(String(text || '')) : rowsFromCSV(String(text || '').replace(/^\uFEFF/, ''));
  const headerAt = rows.findIndex((row) => field(row, ['Symbol']) >= 0 && field(row, ['Type']) >= 0 && field(row, ['Profit']) >= 0);
  if (headerAt < 0) throw new Error('لم أجد جدول صفقات MT5 في التقرير');

  const headers = rows[headerAt];
  const indexOf = (names) => field(headers, names);
  const symbol = indexOf(['Symbol', 'Instrument']);
  const type = indexOf(['Type', 'Side']);
  const profit = indexOf(['Profit', 'P/L']);
  const ticket = indexOf(['Ticket', 'Deal', 'Position']);
  const openTime = indexOf(['Open Time', 'Time']);
  const closeTime = indexOf(['Close Time', 'CloseTime']);
  const openPrice = indexOf(['Open Price', 'Price Open']);
  const closePrice = indexOf(['Close Price', 'Price Close']);
  const lots = indexOf(['Volume', 'Lots']);
  const commission = indexOf(['Commission']);
  const swap = indexOf(['Swap']);
  const sl = indexOf(['S/L', 'SL']);
  const tp = indexOf(['T/P', 'TP']);

  if (symbol < 0 || type < 0 || profit < 0) throw new Error('أعمدة MT5 الأساسية غير موجودة');

  const bodyRows = rows.slice(headerAt + 1);
  const diagnostics = createDiagnostics('MT5 Report', isHtml ? 'html' : 'csv', bodyRows.length);
  let added = 0;

  bodyRows.forEach((row, rowIndex) => {
    diagnostics.scannedRows++;
    const rowNumber = rowIndex + headerAt + 2;

    if (row.length < headers.length * 0.55) {
      diagnostics.skippedRows++;
      return;
    }

    const sym = String(row[symbol] || '').trim();
    const side = String(row[type] || '').trim();
    if (!sym || !side || !/buy|sell/i.test(side)) {
      diagnostics.skippedRows++;
      return;
    }

    const importKey = (ticket >= 0 ? row[ticket] : '') || `${sym}:${row[closeTime] || row[openTime]}:${row[profit]}`;
    if (data.trades.some((trade) => trade.importId === `mt5:${importKey}`)) {
      diagnostics.duplicates++;
      return;
    }

    const profitValue = number(row[profit]);
    const commissionValue = commission >= 0 ? number(row[commission]) : 0;
    const swapValue = swap >= 0 ? number(row[swap]) : 0;

    data.trades.unshift({
      id: crypto.randomUUID(),
      importId: `mt5:${importKey}`,
      accountId,
      source: 'MT5 Report',
      ticket: importKey,
      openTime: openTime >= 0 ? row[openTime] : '',
      closeTime: closeTime >= 0 ? row[closeTime] : '',
      date: dateKey(closeTime >= 0 ? row[closeTime] : row[openTime]),
      entry: openPrice >= 0 ? number(row[openPrice]) : 0,
      close: closePrice >= 0 ? number(row[closePrice]) : 0,
      profit: profitValue,
      commission: commissionValue,
      swap: swapValue,
      netProfit: profitValue + commissionValue + swapValue,
      lots: lots >= 0 ? number(row[lots]) : 0,
      symbol: sym,
      side: /buy/i.test(side) ? 'Buy' : 'Sell',
      sl: sl >= 0 ? number(row[sl]) : 0,
      tp: tp >= 0 ? number(row[tp]) : 0,
      resultR: null,
      note: 'Imported from MT5 Report',
      tags: 'MT5',
    });
    added++;
  });

  diagnostics.added = added;
  if (!added && diagnostics.scannedRows > 0 && diagnostics.duplicates === 0) {
    warn(diagnostics, 'NO_TRADES_IMPORTED', headerAt + 2, 'No closed MT5 trades matched the expected schema');
  }

  return { added, headers, diagnostics, file };
}

module.exports = {
  rowsFromCSV,
  rowsFromHTML,
  fundedNext,
  mt5,
};
