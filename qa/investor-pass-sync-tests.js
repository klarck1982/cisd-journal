const assert = require('assert');
const { applyInvestorPassSnapshot } = require('../lib/investor-pass-sync');

const data = {
  accounts: [{ id: 'fundednext', currentBalance: 50000, currency: 'USD', fundingSyncScope: 'full_readonly' }],
  trades: [],
  openPositions: [{ accountId: 'fundednext', importId: 'old-open', ticket: '1' }],
};

const bridgePayload = {
  syncedAt: '2026-07-26T10:00:00.000Z',
  account: {
    login: 123456,
    server: 'Demo-MT5-Server',
    name: 'Demo Trader',
    company: 'FundedNext',
    currency: 'USD',
    balance: 24950.5,
    equity: 25012.75,
    profit: 62.25,
    margin_free: 24000,
    leverage: 100,
  },
  positions: [
    {
      ticket: 1001,
      time: 1785052800,
      price_open: 1.1,
      volume: 0.1,
      symbol: 'EURUSD',
      type: 0,
      sl: 1.09,
      tp: 1.12,
      profit: 62.25,
      swap: 0,
      comment: 'live open',
    },
  ],
  deals: [
    {
      ticket: 2001,
      time: 1785052800,
      price: 1.1012,
      volume: 0.1,
      symbol: 'EURUSD',
      type: 0,
      entry: 1,
      profit: 12,
      commission: -1,
      swap: 0,
      comment: 'closed deal',
    },
    {
      ticket: 2002,
      time: 1785052800,
      price: 1.1000,
      volume: 0.1,
      symbol: 'EURUSD',
      type: 0,
      entry: 0,
      profit: 0,
      commission: 0,
      swap: 0,
      comment: 'entry deal should skip',
    }
  ],
};

const applied = applyInvestorPassSnapshot(data, 'fundednext', bridgePayload, { syncScope: 'full_readonly' });
assert.equal(data.accounts[0].currentBalance, 24950.5);
assert.equal(data.accounts[0].syncedEquity, 25012.75);
assert.equal(data.accounts[0].syncedTodayProfit, 62.25);
assert.equal(data.accounts[0].syncedFundingSnapshot.accountLogin, 123456);
assert.equal(data.openPositions.length, 1);
assert.equal(data.openPositions[0].symbol, 'EURUSD');
assert.equal(data.openPositions[0].side, 'Buy');
assert.equal(applied.addedTrades, 1);
assert.equal(data.trades.length, 1);
assert.equal(data.trades[0].importId, 'mt5-investor-deal:2001');
assert.equal(data.trades[0].netProfit, 11);

const again = applyInvestorPassSnapshot(data, 'fundednext', bridgePayload, { syncScope: 'full_readonly' });
assert.equal(again.addedTrades, 0);
assert.equal(data.trades.length, 1);

console.log('Investor Pass Sync QA: PASS (snapshot application, open positions, closed deals de-duplication)');
