const crypto = require('crypto');

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isoFromTimestamp(seconds) {
  const time = Number(seconds);
  if (!Number.isFinite(time) || time <= 0) return '';
  return new Date(time * 1000).toISOString();
}

function dateKey(value) {
  const iso = isoFromTimestamp(value);
  return iso ? iso.slice(0, 10) : '';
}

function sideFromPositionType(type) {
  return Number(type) === 1 ? 'Sell' : 'Buy';
}

function normalizeOpenPositions(accountId, positions = []) {
  return positions.map((position) => ({
    id: `mt5-investor-open:${position.ticket || position.identifier || crypto.randomUUID()}`,
    importId: `mt5-investor-open:${position.ticket || position.identifier || crypto.randomUUID()}`,
    accountId,
    source: 'MT5 Investor Pass',
    ticket: String(position.ticket || position.identifier || ''),
    openTime: isoFromTimestamp(position.time || position.time_msc / 1000),
    entry: toNumber(position.price_open),
    lots: toNumber(position.volume),
    symbol: position.symbol || '',
    side: sideFromPositionType(position.type),
    sl: toNumber(position.sl),
    tp: toNumber(position.tp),
    netProfit: toNumber(position.profit),
    swap: toNumber(position.swap),
    commission: 0,
    comment: position.comment || '',
  }));
}

function shouldImportDeal(deal = {}) {
  const entry = Number(deal.entry);
  if (Number.isFinite(entry) && entry === 0) return false;
  if (!deal.symbol) return false;
  if (!deal.ticket && !deal.order && !deal.position_id) return false;
  return true;
}

function normalizeClosedDeal(accountId, deal) {
  const ticket = String(deal.ticket || deal.order || deal.position_id || '');
  const openTime = isoFromTimestamp(deal.time || deal.time_msc / 1000);
  return {
    id: crypto.randomUUID(),
    importId: `mt5-investor-deal:${ticket}`,
    accountId,
    source: 'MT5 Investor Pass',
    ticket,
    openTime,
    closeTime: openTime,
    date: dateKey(deal.time || deal.time_msc / 1000),
    entry: toNumber(deal.price),
    close: toNumber(deal.price),
    profit: toNumber(deal.profit),
    commission: toNumber(deal.commission),
    swap: toNumber(deal.swap),
    netProfit: toNumber(deal.profit) + toNumber(deal.commission) + toNumber(deal.swap),
    lots: toNumber(deal.volume),
    symbol: deal.symbol || '',
    side: Number(deal.type) === 1 ? 'Sell' : 'Buy',
    sl: 0,
    tp: 0,
    resultR: null,
    note: deal.comment || 'Imported from MT5 Investor Pass',
    tags: 'MT5,InvestorPass',
  };
}

function mergeInvestorPassTrades(data, accountId, deals = []) {
  let added = 0;
  for (const deal of deals) {
    if (!shouldImportDeal(deal)) continue;
    const trade = normalizeClosedDeal(accountId, deal);
    if (data.trades.some((item) => item.importId === trade.importId)) continue;
    data.trades.unshift(trade);
    added++;
  }
  return added;
}

function applyInvestorPassSnapshot(data, accountId, bridgePayload, options = {}) {
  const account = data.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error('Account not found');

  const info = bridgePayload.account || {};
  const openPositions = normalizeOpenPositions(accountId, bridgePayload.positions || []);
  const syncScope = options.syncScope || account.fundingSyncScope || 'full_readonly';

  account.lastFundingSync = bridgePayload.syncedAt || new Date().toISOString();
  account.lastFundingSource = 'MT5 Investor Pass';
  account.lastFundingError = '';
  account.syncedEquity = toNumber(info.equity);
  account.syncedTodayProfit = toNumber(info.profit);
  account.syncedFundingSnapshot = {
    accountLogin: info.login || '',
    server: info.server || '',
    name: info.name || '',
    company: info.company || '',
    currency: info.currency || account.currency || 'USD',
    balance: toNumber(info.balance),
    equity: toNumber(info.equity),
    marginFree: toNumber(info.margin_free),
    leverage: toNumber(info.leverage),
    terminal: bridgePayload.terminal || {},
  };

  if (toNumber(info.balance)) account.currentBalance = toNumber(info.balance);
  if (!account.currency && info.currency) account.currency = info.currency;

  if (syncScope === 'account_and_open_positions' || syncScope === 'full_readonly') {
    data.openPositions = (data.openPositions || []).filter((item) => item.accountId !== accountId);
    data.openPositions.push(...openPositions);
  }

  let addedTrades = 0;
  if (syncScope === 'full_readonly') {
    addedTrades = mergeInvestorPassTrades(data, accountId, bridgePayload.deals || []);
  }

  return {
    account,
    openPositions,
    addedTrades,
  };
}

module.exports = {
  applyInvestorPassSnapshot,
  normalizeOpenPositions,
  mergeInvestorPassTrades,
  normalizeClosedDeal,
  shouldImportDeal,
};
