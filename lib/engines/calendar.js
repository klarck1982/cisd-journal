/**
 * Calendar Engine — monthly P&L grid.
 *
 * A calendar view is standard in every competing journal and was the most visible gap
 * here. Its value is pattern recognition at a glance: which weekdays are profitable,
 * whether a big win is followed by giving it back, and how much of the month was
 * actually traded.
 *
 * The engine works purely on dates already stored on trades. It deliberately does no
 * timezone conversion of its own — the caller passes the account's trading timezone so
 * a day boundary here always matches the day boundary used by the risk engine.
 */

const { tradingDayKey, DEFAULT_TIMEZONE } = require('../trading-day');

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== '';
}

/**
 * Trades are journalled either in R or in currency. Mixing them in one total would be
 * meaningless, so the engine picks the unit the account actually uses and reports it.
 */
function pickUnit(trades) {
  let rCount = 0;
  let cashCount = 0;
  for (const trade of trades) {
    const manualR = hasValue(trade.resultR) && trade.resultRSource !== 'derived';
    if (manualR || (hasValue(trade.resultR) && !hasValue(trade.netProfit))) rCount++;
    else if (hasValue(trade.netProfit)) cashCount++;
    else if (hasValue(trade.resultR)) rCount++;
  }
  return rCount > cashCount ? 'R' : 'currency';
}

function tradeValue(trade, unit) {
  if (unit === 'R') return hasValue(trade.resultR) ? toNumber(trade.resultR) : 0;
  if (hasValue(trade.netProfit)) return toNumber(trade.netProfit);
  if (hasValue(trade.profit)) return toNumber(trade.profit);
  return 0;
}

function tradeDay(trade, timezone) {
  const raw = trade.date || trade.closeTime || trade.createdAt || trade.openTime;
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(raw))) return String(raw);
  return tradingDayKey(raw, timezone);
}

function pad(value) {
  return String(value).padStart(2, '0');
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Builds a 7-column grid for one month, padded so the first row starts on the
 * configured week start and the last row is complete.
 */
function buildMonthCalendar(data, accountId, options = {}) {
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const reference = options.month || tradingDayKey(options.now, timezone).slice(0, 7);
  const [yearText, monthText] = reference.split('-');
  const year = Number(yearText);
  const month = Number(monthText);

  // 0 = Sunday. Most prop-firm traders read a Sunday-first week.
  const weekStartsOn = options.weekStartsOn === 1 ? 1 : 0;

  const trades = (data.trades || []).filter((trade) => trade.accountId === accountId);
  const unit = options.unit || pickUnit(trades);

  const byDay = new Map();
  for (const trade of trades) {
    const day = tradeDay(trade, timezone);
    if (!day.startsWith(reference)) continue;
    const bucket = byDay.get(day) || { day, count: 0, wins: 0, losses: 0, value: 0 };
    const value = tradeValue(trade, unit);
    bucket.count++;
    bucket.value += value;
    if (value > 0) bucket.wins++;
    else if (value < 0) bucket.losses++;
    byDay.set(day, bucket);
  }

  const total = daysInMonth(year, month);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leading = (firstWeekday - weekStartsOn + 7) % 7;

  const cells = [];
  for (let index = 0; index < leading; index++) cells.push({ empty: true });

  for (let dayNumber = 1; dayNumber <= total; dayNumber++) {
    const key = `${year}-${pad(month)}-${pad(dayNumber)}`;
    const bucket = byDay.get(key);
    cells.push({
      empty: false,
      day: key,
      dayNumber,
      traded: !!bucket,
      count: bucket?.count || 0,
      wins: bucket?.wins || 0,
      losses: bucket?.losses || 0,
      value: bucket ? round(bucket.value) : 0,
    });
  }

  while (cells.length % 7 !== 0) cells.push({ empty: true });

  // Weekly rows with their own totals, which is where most patterns show up.
  const weeks = [];
  for (let index = 0; index < cells.length; index += 7) {
    const row = cells.slice(index, index + 7);
    const traded = row.filter((cell) => !cell.empty && cell.traded);
    weeks.push({
      cells: row,
      total: round(traded.reduce((sum, cell) => sum + cell.value, 0)),
      tradedDays: traded.length,
      trades: traded.reduce((sum, cell) => sum + cell.count, 0),
    });
  }

  const tradedCells = cells.filter((cell) => !cell.empty && cell.traded);
  const greenDays = tradedCells.filter((cell) => cell.value > 0);
  const redDays = tradedCells.filter((cell) => cell.value < 0);

  const best = tradedCells.reduce((top, cell) => (!top || cell.value > top.value ? cell : top), null);
  const worst = tradedCells.reduce((low, cell) => (!low || cell.value < low.value ? cell : low), null);

  // Performance by weekday, which answers "which day of the week suits me".
  const weekdays = Array.from({ length: 7 }, (_, index) => ({
    weekday: (weekStartsOn + index) % 7,
    value: 0,
    days: 0,
    trades: 0,
  }));
  for (const cell of tradedCells) {
    const weekday = new Date(`${cell.day}T00:00:00Z`).getUTCDay();
    const slot = weekdays.find((item) => item.weekday === weekday);
    if (!slot) continue;
    slot.value += cell.value;
    slot.days++;
    slot.trades += cell.count;
  }

  return {
    accountId,
    month: reference,
    year,
    monthNumber: month,
    unit,
    weekStartsOn,
    weeks,
    totals: {
      net: round(tradedCells.reduce((sum, cell) => sum + cell.value, 0)),
      tradedDays: tradedCells.length,
      trades: tradedCells.reduce((sum, cell) => sum + cell.count, 0),
      greenDays: greenDays.length,
      redDays: redDays.length,
      dayWinRate: tradedCells.length ? round(greenDays.length / tradedCells.length, 4) : 0,
      averageDay: tradedCells.length
        ? round(tradedCells.reduce((sum, cell) => sum + cell.value, 0) / tradedCells.length)
        : 0,
    },
    best: best && best.value > 0 ? best : null,
    worst: worst && worst.value < 0 ? worst : null,
    weekdays: weekdays.map((item) => ({
      ...item,
      value: round(item.value),
      average: item.days ? round(item.value / item.days) : 0,
    })),
  };
}

/**
 * Months that contain at least one trade, newest first, for the month switcher.
 */
function listTradedMonths(data, accountId, options = {}) {
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const months = new Set();
  for (const trade of data.trades || []) {
    if (trade.accountId !== accountId) continue;
    const day = tradeDay(trade, timezone);
    if (day) months.add(day.slice(0, 7));
  }
  return [...months].sort().reverse();
}

module.exports = {
  buildMonthCalendar,
  listTradedMonths,
};
