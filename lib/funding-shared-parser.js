function parseMoney(value) {
  const cleaned = String(value || '')
    .replace(/[^0-9+\-.,]/g, '')
    .replace(/,(?=\d{3}(?:\D|$))/g, '');
  const number = Number(cleaned);
  return Number.isFinite(number) ? number : null;
}

function parsePercent(value) {
  const match = String(value || '').match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const number = Number(match[0]);
  return Number.isFinite(number) ? number : null;
}

function findValue(text, label) {
  const match = text.match(new RegExp(`${label}\\s*([\\s\\S]{0,120})`, 'i'));
  if (!match) return '';
  return String(match[1] || '').trim();
}

function parseTradingRows(tables = []) {
  const table = tables.find((rows) => Array.isArray(rows?.[0]) && rows[0].some((cell) => /symbol/i.test(cell)));
  if (!table || table.length < 2) return [];

  const headers = table[0];
  return table.slice(1).map((row) => {
    const entry = {};
    headers.forEach((header, index) => {
      entry[header] = row[index] || '';
    });
    return entry;
  }).filter((entry) => entry.Symbol || entry.symbol);
}

function parseFundingPipsSharedText(text, tables = []) {
  const body = String(text || '').replace(/\r/g, '');
  const ownerMatch = body.match(/^#?\s*(.+?)'s Trading Account/im) || body.match(/^#?\s*(.+?) Trading Account/im);
  const accountSizeMatch = body.match(/Account Size\s*\$?([\d,]+(?:\.\d+)?)/i);
  const todayProfitMatch = body.match(/Today's Profit\s*([+\-$\d,\.]+)/i);
  const scoreMatch = body.match(/Score\s*([\d.]+)/i);
  const balanceMatch = body.match(/Balance\s*\$?([\d,]+(?:\.\d+)?)\s*\$?([\d,]+(?:\.\d+)?)\s*Max/i);
  const equityMatch = body.match(/Equity\s*\$?([\d,]+(?:\.\d+)?)\s*\$?([\d,]+(?:\.\d+)?)\s*Max/i);
  const startDateMatch = body.match(/Start Date\s*([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/i);
  const totalTradesMatch = body.match(/Total Trades Taken\s*(\d+)/i);
  const totalLotsMatch = body.match(/Total Lots Used\s*([\d.]+)/i);
  const winRatioMatch = body.match(/Win Ratio\s*([\d.]+%)/i);
  const averageWinMatch = body.match(/Average Win\s*([+\-$\d,\.]+)/i);
  const averageLossMatch = body.match(/Average Loss\s*([+\-$\d,\.]+)/i);
  const profitFactorMatch = body.match(/Profit Factor\s*([\d.]+)/i);
  const biggestWinMatch = body.match(/Biggest Win\s*([+\-$\d,\.]+)/i);
  const biggestLossMatch = body.match(/Biggest Loss\s*([+\-$\d,\.]+)/i);
  const phaseMatch = body.match(/Phase\s*(\d+)/i);
  const platformMatch = body.match(/Meta Trader\s*5/i);
  const trades = parseTradingRows(tables);

  return {
    owner: ownerMatch ? ownerMatch[1].trim() : '',
    accountSize: accountSizeMatch ? parseMoney(accountSizeMatch[1]) : null,
    todayProfit: todayProfitMatch ? parseMoney(todayProfitMatch[1]) : null,
    score: scoreMatch ? Number(scoreMatch[1]) : null,
    balance: balanceMatch ? parseMoney(balanceMatch[1]) : null,
    balanceMax: balanceMatch ? parseMoney(balanceMatch[2]) : null,
    equity: equityMatch ? parseMoney(equityMatch[1]) : null,
    equityMax: equityMatch ? parseMoney(equityMatch[2]) : null,
    startDate: startDateMatch ? startDateMatch[1] : '',
    totalTrades: totalTradesMatch ? Number(totalTradesMatch[1]) : null,
    totalLots: totalLotsMatch ? Number(totalLotsMatch[1]) : null,
    winRatio: winRatioMatch ? parsePercent(winRatioMatch[1]) : null,
    averageWin: averageWinMatch ? parseMoney(averageWinMatch[1]) : null,
    averageLoss: averageLossMatch ? parseMoney(averageLossMatch[1]) : null,
    profitFactor: profitFactorMatch ? Number(profitFactorMatch[1]) : null,
    biggestWin: biggestWinMatch ? parseMoney(biggestWinMatch[1]) : null,
    biggestLoss: biggestLossMatch ? parseMoney(biggestLossMatch[1]) : null,
    phase: phaseMatch ? `Phase ${phaseMatch[1]}` : '',
    platform: platformMatch ? 'Meta Trader 5' : '',
    closedTrades: trades,
    labels: {
      rawBalance: findValue(body, 'Balance'),
      rawEquity: findValue(body, 'Equity'),
    },
  };
}

module.exports = {
  parseFundingPipsSharedText,
  parseTradingRows,
  parseMoney,
  parsePercent,
};
