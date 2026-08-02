const { tradingDayKey, DEFAULT_TIMEZONE } = require('../trading-day');

function toNumber(value) {
  return Number(value) || 0;
}

function hasBacktestResult(signal) {
  return signal.resultR !== null
    && signal.resultR !== undefined
    && signal.resultR !== ''
    && Number.isFinite(Number(signal.resultR));
}

/**
 * True only when the trader typed an R value themselves.
 * Trades imported from a broker report carry an R derived from price
 * (`resultRSource === 'derived'`), which must not replace their currency P&L.
 */
function hasManualResultR(trade) {
  if (trade.resultR === null || trade.resultR === undefined || trade.resultR === '') return false;
  return trade.resultRSource !== 'derived';
}

function eventResult(event) {
  return toNumber(event.result);
}

function classifyTradeSource(trade) {
  if (trade.backtestId || String(trade.source || '').toUpperCase() === 'BACKTEST_MANUAL') return 'backtest';
  if (trade.signalId) return 'cisd';
  return String(trade.source || '').toLowerCase() === 'manual' ? 'manual' : 'imported';
}

/**
 * Hour-of-day for a trade timestamp, in the account's trading timezone.
 *
 * The previous expression was /\s(\d{1,2}):/ — it required a space before the
 * hour, so it matched "2026.07.27 13:00" but never an ISO "2026-07-27T13:00:00Z"
 * and never a bare "2026-07-27". Both fell through to -1 and every affected
 * trade was bucketed as 'After', which is why manually logged trades all
 * collapsed into a single meaningless session column.
 *
 * A date with no time carries no session information; -1 keeps it out of the
 * London/New York buckets rather than inventing one.
 */
function parseHour(value, timezone) {
  const raw = String(value || '').trim();
  if (!raw) return -1;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return -1;

  // Absolute instants are converted; a naive local timestamp is read as written.
  const isAbsolute = /T/.test(raw) || /[Zz]$/.test(raw) || /[+-]\d{2}:?\d{2}$/.test(raw);
  if (isAbsolute) {
    const date = new Date(raw);
    if (Number.isNaN(date.getTime())) return -1;
    const hour = new Intl.DateTimeFormat('en-GB', {
      timeZone: timezone || DEFAULT_TIMEZONE,
      hour: '2-digit',
      hour12: false,
    }).format(date);
    return Number(hour);
  }

  const match = raw.match(/[\sT](\d{1,2}):/);
  return match ? Number(match[1]) : -1;
}

function classifyTradeSession(trade, timezone) {
  const hour = parseHour(trade.openTime || trade.closeTime || trade.date || '', timezone);
  if (hour < 0) return 'After';
  if (hour < 8) return 'London';
  if (hour < 17) return 'New York';
  return 'After';
}

function normalizeSignalSession(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('london')) return 'London';
  if (text.includes('new york') || text.includes('newyork') || text.includes('ny')) return 'New York';
  if (text.includes('asia')) return 'Asia';
  if (text.includes('after') || text.includes('closed')) return 'After';
  return 'After';
}

function normalizeSide(value) {
  const text = String(value || '').trim();
  if (!text) return 'Unknown';
  if (/^buy$/i.test(text)) return 'Buy';
  if (/^sell$/i.test(text)) return 'Sell';
  if (text.startsWith('+')) return 'Buy';
  if (text.startsWith('-')) return 'Sell';
  return text;
}

/**
 * Calendar day for an event, in the account's trading timezone.
 *
 * This engine had no timezone awareness at all, so a trade closed at 21:00 New
 * York appeared under the next day here while the calendar engine — which does
 * use tradingDayKey — placed it correctly. Two pages of the same app disagreed
 * about which day a trade belonged to.
 */
function eventDateKey(value, timezone) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return tradingDayKey(raw, timezone);
}

function eventMonthKey(value, timezone) {
  return eventDateKey(value, timezone).slice(0, 7);
}

function normalizeTags(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTradeEvent(trade, timezone) {
  return {
    kind: 'trade',
    source: classifyTradeSource(trade),
    accountId: trade.accountId,
    instrument: trade.symbol || 'Unknown',
    side: normalizeSide(trade.side),
    session: trade.session || classifyTradeSession(trade, timezone),
    at: trade.createdAt || trade.closeTime || trade.date || trade.openTime || '',
    date: eventDateKey(trade.date || trade.closeTime || trade.createdAt, timezone),
    month: eventMonthKey(trade.date || trade.closeTime || trade.createdAt, timezone),
    // Only a manually entered R overrides money here. A *derived* R is computed from
    // price and would silently switch an imported trade's P&L from currency to R,
    // mixing units inside the same aggregate. R-based analysis lives in the edge engine.
    result: hasManualResultR(trade) ? toNumber(trade.resultR) : toNumber(trade.netProfit),
    tags: normalizeTags(trade.tags),
    raw: trade,
  };
}

function buildBacktestEvent(signal, timezone) {
  // The event belongs to the moment the CISD formed (signalAt), not to the
  // moment the CSV was imported. Using importedAt stamped every occurrence of
  // a session with the same instant and destroyed chronological ordering.
  const at = signal.signalAt || signal.importedAt || '';
  return {
    kind: 'backtest',
    source: 'backtest',
    accountId: null,
    instrument: signal.Instrument || 'Unknown',
    side: normalizeSide(signal.Direction),
    session: normalizeSignalSession(signal.Session),
    at,
    date: eventDateKey(at, timezone),
    month: eventMonthKey(at, timezone),
    result: toNumber(signal.resultR),
    tags: [],
    raw: signal,
  };
}

function matchesPeriod(value, options = {}) {
  const at = new Date(value || '');
  if (Number.isNaN(at.getTime())) return false;

  if (options.from || options.to) {
    const from = options.from ? new Date(options.from) : null;
    const to = options.to ? new Date(options.to) : null;
    if (from && at < from) return false;
    if (to && at > to) return false;
    return true;
  }

  const period = options.period || 'all';
  if (period === 'all') return true;

  const now = options.now ? new Date(options.now) : new Date();
  const timezone = options.timezone || DEFAULT_TIMEZONE;

  // Compared as trading days so "today" means the trader's day, not the UTC day.
  if (period === 'today') return tradingDayKey(at, timezone) === tradingDayKey(now, timezone);
  if (period === 'week') return at >= new Date(now.getTime() - 7 * 86400000);
  if (period === 'month') return tradingDayKey(at, timezone).slice(0, 7) === tradingDayKey(now, timezone).slice(0, 7);
  return true;
}

function matchesFilter(event, options = {}) {
  if (!matchesPeriod(event.at, options)) return false;
  if (options.source && options.source !== 'all' && event.source !== options.source) return false;
  if (options.instrument && options.instrument !== 'all' && event.instrument !== options.instrument) return false;
  if (options.side && options.side !== 'all' && event.side !== options.side) return false;
  if (options.session && options.session !== 'all' && event.session !== options.session) return false;
  return true;
}

function createStatsBucket(label) {
  return {
    label,
    count: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    net: 0,
    average: 0,
    winRate: 0,
  };
}

function finalizeBucket(bucket) {
  bucket.average = bucket.count ? bucket.net / bucket.count : 0;
  bucket.winRate = bucket.count ? bucket.wins / bucket.count : 0;
  return bucket;
}

function accumulateBucket(bucket, result) {
  bucket.count++;
  bucket.net += result;
  if (result > 0) bucket.wins++;
  else if (result < 0) bucket.losses++;
  else bucket.breakeven++;
}

function summarizeEvents(events) {
  const ordered = events.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const summary = {
    count: ordered.length,
    wins: 0,
    losses: 0,
    breakeven: 0,
    net: 0,
    average: 0,
    expectancy: 0,
    profitFactor: null,
    avgWin: 0,
    avgLoss: 0,
    payoffRatio: null,
    maxDrawdown: 0,
    currentDrawdown: 0,
    bestResult: null,
    worstResult: null,
    consecutiveWins: 0,
    consecutiveLosses: 0,
    currentStreak: { type: 'flat', count: 0 },
    equityCurve: [],
  };

  let equity = 0;
  let peak = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let currentWin = 0;
  let currentLoss = 0;
  let currentType = 'flat';

  for (const event of ordered) {
    const result = eventResult(event);
    summary.net += result;
    if (summary.bestResult === null || result > summary.bestResult) summary.bestResult = result;
    if (summary.worstResult === null || result < summary.worstResult) summary.worstResult = result;

    if (result > 0) {
      summary.wins++;
      grossWin += result;
      currentWin++;
      currentLoss = 0;
      currentType = 'win';
      if (currentWin > summary.consecutiveWins) summary.consecutiveWins = currentWin;
    } else if (result < 0) {
      summary.losses++;
      grossLoss += Math.abs(result);
      currentLoss++;
      currentWin = 0;
      currentType = 'loss';
      if (currentLoss > summary.consecutiveLosses) summary.consecutiveLosses = currentLoss;
    } else {
      summary.breakeven++;
      currentWin = 0;
      currentLoss = 0;
      currentType = 'flat';
    }

    equity += result;
    if (equity > peak) peak = equity;
    const drawdown = equity - peak;
    if (drawdown < summary.maxDrawdown) summary.maxDrawdown = drawdown;
    summary.currentDrawdown = drawdown;
    summary.equityCurve.push({ at: event.at, result, equity });
  }

  summary.average = summary.count ? summary.net / summary.count : 0;
  summary.expectancy = summary.average;
  summary.avgWin = summary.wins ? grossWin / summary.wins : 0;
  summary.avgLoss = summary.losses ? -(grossLoss / summary.losses) : 0;
  summary.profitFactor = grossLoss ? grossWin / grossLoss : null;
  summary.payoffRatio = summary.avgLoss ? Math.abs(summary.avgWin / summary.avgLoss) : null;
  summary.currentStreak = {
    type: currentType,
    count: currentType === 'win' ? currentWin : currentType === 'loss' ? currentLoss : 0,
  };

  return summary;
}

function groupEvents(events, keySelector) {
  const buckets = new Map();
  for (const event of events) {
    const key = keySelector(event) || 'Unknown';
    if (!buckets.has(key)) buckets.set(key, createStatsBucket(key));
    accumulateBucket(buckets.get(key), eventResult(event));
  }
  return [...buckets.values()].map(finalizeBucket).sort((a, b) => b.net - a.net || b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function buildTagBreakdown(events) {
  const buckets = new Map();
  for (const event of events.filter((item) => item.kind === 'trade')) {
    for (const tag of event.tags) {
      if (!buckets.has(tag)) buckets.set(tag, createStatsBucket(tag));
      accumulateBucket(buckets.get(tag), eventResult(event));
    }
  }
  return [...buckets.values()].map(finalizeBucket).sort((a, b) => b.net - a.net || b.count - a.count || String(a.label).localeCompare(String(b.label)));
}

function buildHeatmap(events) {
  const sessions = ['London', 'New York', 'After'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells = {};

  for (const event of events) {
    // event.date is already the trading day; using the raw instant here would
    // put a late-evening trade on the wrong weekday.
    if (!event.date) continue;
    const date = new Date(`${event.date}T12:00:00Z`);
    if (Number.isNaN(date.getTime())) continue;
    const key = `${date.getUTCDay()}-${event.session}`;
    cells[key] = cells[key] || { dayIndex: date.getUTCDay(), day: days[date.getUTCDay()], session: event.session, count: 0, net: 0 };
    cells[key].count++;
    cells[key].net += eventResult(event);
  }

  return days.flatMap((day, dayIndex) => sessions.map((session) => cells[`${dayIndex}-${session}`] || { dayIndex, day, session, count: 0, net: 0 }));
}

function buildAvailableFilters(events) {
  const unique = (values) => [...new Set(values.filter(Boolean))].sort((a, b) => String(a).localeCompare(String(b)));
  return {
    sources: unique(events.map((event) => event.source)),
    instruments: unique(events.map((event) => event.instrument)),
    sides: unique(events.map((event) => event.side)),
    sessions: unique(events.map((event) => event.session)),
    tags: unique(events.flatMap((event) => event.tags || [])),
  };
}

function buildBacktestComparison(data, accountId) {
  const backtests = (data.backtests || []).filter((item) => item.accountId === accountId);
  return backtests.map((backtest) => {
    const signals = (data.backtestSignals || []).filter((signal) => signal.backtestId === backtest.id);
    const reviewed = signals.filter((signal) => {
      const status = String(signal.status || '').toUpperCase();
      return ['WIN', 'LOSS', 'BE'].includes(status) && hasBacktestResult(signal);
    });
    const manualTrades = (data.trades || []).filter((trade) => trade.accountId === accountId && trade.backtestId === backtest.id && hasManualResultR(trade));
    // Use signalAt for indicator opportunities and the trade date for manual
    // rows. Both are then part of one chronological session comparison.
    const signalEvents = reviewed.map((signal) => ({ at: signal.signalAt || signal.importedAt || '', result: toNumber(signal.resultR) }));
    const manualEvents = manualTrades.map((trade) => ({ at: trade.date || trade.createdAt || '', result: toNumber(trade.resultR) }));
    const summary = summarizeEvents([...signalEvents, ...manualEvents]);
    const signalSummary = summarizeEvents(signalEvents);
    const manualSummary = summarizeEvents(manualEvents);
    const filters = backtest.filters || {};
    return {
      id: backtest.id,
      name: backtest.name,
      type: backtest.type,
      symbol: filters.symbol || backtest.symbol || '',
      timeframe: filters.tf || backtest.tf || '',
      totalSignals: signals.length,
      reviewed: reviewed.length,
      manualTrades: manualTrades.length,
      executedTrades: summary.count,
      winRate: summary.count ? summary.wins / summary.count : 0,
      averageResult: summary.average,
      netResult: summary.net,
      signalNetResult: signalSummary.net,
      manualNetResult: manualSummary.net,
    };
  });
}

function collectAccountEvents(data, accountId, timezone) {
  const tradeEvents = (data.trades || [])
    .filter((trade) => trade.accountId === accountId)
    .map((trade) => buildTradeEvent(trade, timezone));
  const backtestIds = new Set((data.backtests || []).filter((backtest) => backtest.accountId === accountId).map((backtest) => backtest.id));
  const backtestEvents = (data.backtestSignals || [])
    .filter((signal) => backtestIds.has(signal.backtestId)
      && ['WIN', 'LOSS', 'BE'].includes(String(signal.status || '').toUpperCase())
      && hasBacktestResult(signal))
    .map((signal) => buildBacktestEvent(signal, timezone));

  return [...tradeEvents, ...backtestEvents].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function buildAccountAnalyticsSnapshot(data, accountId, options = {}) {
  // Every day/month bucket, session label and period filter below is resolved in
  // this timezone, so analytics agrees with the calendar and risk engines.
  const timezone = options.timezone || data.settings?.timezone || DEFAULT_TIMEZONE;
  const allEvents = collectAccountEvents(data, accountId, timezone);
  const filteredEvents = allEvents.filter((event) => matchesFilter(event, { ...options, timezone }));
  const summary = summarizeEvents(filteredEvents);

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    filters: {
      period: options.period || 'all',
      source: options.source || 'all',
      instrument: options.instrument || 'all',
      side: options.side || 'all',
      session: options.session || 'all',
      from: options.from || null,
      to: options.to || null,
    },
    availableFilters: buildAvailableFilters(allEvents),
    totals: summary,
    breakdowns: {
      bySource: groupEvents(filteredEvents, (event) => event.source),
      byInstrument: groupEvents(filteredEvents, (event) => event.instrument),
      bySide: groupEvents(filteredEvents, (event) => event.side),
      bySession: groupEvents(filteredEvents, (event) => event.session),
      byDay: groupEvents(filteredEvents, (event) => event.date),
      byMonth: groupEvents(filteredEvents, (event) => event.month),
      byTag: buildTagBreakdown(filteredEvents),
    },
    heatmap: buildHeatmap(filteredEvents),
    backtestComparison: buildBacktestComparison(data, accountId),
    events: filteredEvents,
  };
}

module.exports = {
  buildAccountAnalyticsSnapshot,
  collectAccountEvents,
  classifyTradeSource,
  classifyTradeSession,
  normalizeSide,
};
