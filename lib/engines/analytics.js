function toNumber(value) {
  return Number(value) || 0;
}

function eventResult(event) {
  return toNumber(event.result);
}

function classifyTradeSource(trade) {
  if (trade.signalId) return 'cisd';
  return String(trade.source || '').toLowerCase() === 'manual' ? 'manual' : 'imported';
}

function parseHour(value) {
  const match = String(value || '').match(/\s(\d{1,2}):/);
  return match ? Number(match[1]) : -1;
}

function classifyTradeSession(trade) {
  const hour = parseHour(trade.openTime || trade.closeTime || '');
  if (hour < 0) return 'After';
  if (hour < 8) return 'London';
  if (hour < 17) return 'New York';
  return 'After';
}

function normalizeSignalSession(value) {
  const text = String(value || '').toLowerCase();
  if (text.includes('london')) return 'London';
  if (text.includes('new york') || text.includes('newyork') || text.includes('ny')) return 'New York';
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

function eventDateKey(value) {
  return String(value || '').slice(0, 10);
}

function eventMonthKey(value) {
  return String(value || '').slice(0, 7);
}

function normalizeTags(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildTradeEvent(trade) {
  return {
    kind: 'trade',
    source: classifyTradeSource(trade),
    accountId: trade.accountId,
    instrument: trade.symbol || 'Unknown',
    side: normalizeSide(trade.side),
    session: classifyTradeSession(trade),
    at: trade.createdAt || trade.closeTime || trade.date || trade.openTime || '',
    date: eventDateKey(trade.date || trade.closeTime || trade.createdAt),
    month: eventMonthKey(trade.date || trade.closeTime || trade.createdAt),
    result: trade.resultR !== null && trade.resultR !== undefined && trade.resultR !== '' ? toNumber(trade.resultR) : toNumber(trade.netProfit),
    tags: normalizeTags(trade.tags),
    raw: trade,
  };
}

function buildBacktestEvent(signal) {
  return {
    kind: 'backtest',
    source: 'backtest',
    accountId: null,
    instrument: signal.Instrument || 'Unknown',
    side: normalizeSide(signal.Direction),
    session: normalizeSignalSession(signal.Session),
    at: signal.importedAt || '',
    date: eventDateKey(signal.importedAt || ''),
    month: eventMonthKey(signal.importedAt || ''),
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
  if (period === 'today') return at.toISOString().slice(0, 10) === now.toISOString().slice(0, 10);
  if (period === 'week') return at >= new Date(now.getTime() - 7 * 86400000);
  if (period === 'month') return at.getUTCFullYear() === now.getUTCFullYear() && at.getUTCMonth() === now.getUTCMonth();
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
    const date = new Date(event.at || '');
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
    const reviewed = signals.filter((signal) => ['WIN', 'LOSS', 'BE'].includes(String(signal.status || '').toUpperCase()));
    const events = reviewed.map((signal) => ({ at: signal.importedAt || '', result: toNumber(signal.resultR) }));
    const summary = summarizeEvents(events);
    return {
      id: backtest.id,
      name: backtest.name,
      type: backtest.type,
      symbol: backtest.symbol || '',
      timeframe: backtest.tf || '',
      totalSignals: signals.length,
      reviewed: reviewed.length,
      winRate: summary.count ? summary.wins / summary.count : 0,
      averageResult: summary.average,
      netResult: summary.net,
    };
  });
}

function collectAccountEvents(data, accountId) {
  const tradeEvents = (data.trades || []).filter((trade) => trade.accountId === accountId).map(buildTradeEvent);
  const backtestIds = new Set((data.backtests || []).filter((backtest) => backtest.accountId === accountId).map((backtest) => backtest.id));
  const backtestEvents = (data.backtestSignals || [])
    .filter((signal) => backtestIds.has(signal.backtestId) && ['WIN', 'LOSS', 'BE'].includes(String(signal.status || '').toUpperCase()))
    .map(buildBacktestEvent);

  return [...tradeEvents, ...backtestEvents].sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

function buildAccountAnalyticsSnapshot(data, accountId, options = {}) {
  const allEvents = collectAccountEvents(data, accountId);
  const filteredEvents = allEvents.filter((event) => matchesFilter(event, options));
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
