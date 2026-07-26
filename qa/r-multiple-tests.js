const assert = require('assert');
const { calculateRMultiple, withDerivedR } = require('../lib/r-multiple');
const { fundedNext, mt5 } = require('../lib/importers');

// ------------------------------------------------------------- buy trades
assert.equal(calculateRMultiple({ entry: 100, sl: 98, close: 106, side: 'Buy' }), 3);
assert.equal(calculateRMultiple({ entry: 100, sl: 98, close: 98, side: 'Buy' }), -1);
assert.equal(calculateRMultiple({ entry: 100, sl: 98, close: 100, side: 'Buy' }), 0);
assert.equal(calculateRMultiple({ entry: 100, sl: 98, close: 101, side: 'Buy' }), 0.5);

// ------------------------------------------------------------ sell trades
// Direction must be inverted: price falling is profit for a short.
assert.equal(calculateRMultiple({ entry: 100, sl: 102, close: 94, side: 'Sell' }), 3);
assert.equal(calculateRMultiple({ entry: 100, sl: 102, close: 102, side: 'Sell' }), -1);
assert.equal(calculateRMultiple({ entry: 100, sl: 102, close: 100, side: 'Sell' }), 0);
assert.equal(calculateRMultiple({ entry: 100, sl: 102, close: 94, side: 'short' }), 3);

// A sell must never be scored like a buy.
const sellDown = calculateRMultiple({ entry: 100, sl: 102, close: 94, side: 'Sell' });
const buyDown = calculateRMultiple({ entry: 100, sl: 98, close: 94, side: 'Buy' });
assert.ok(sellDown > 0 && buyDown < 0, 'the same price move must score oppositely by side');

// -------------------------------------------------- refuse to guess badly
// A wrong R silently corrupts every downstream metric, so return null instead.
assert.equal(calculateRMultiple({ entry: 100, sl: 0, close: 106, side: 'Buy' }), null, 'no stop loss');
assert.equal(calculateRMultiple({ entry: 100, sl: 100, close: 106, side: 'Buy' }), null, 'zero risk');
assert.equal(calculateRMultiple({ entry: 100, sl: 98, side: 'Buy' }), null, 'no close price');
assert.equal(calculateRMultiple({ sl: 98, close: 106, side: 'Buy' }), null, 'no entry');
assert.equal(calculateRMultiple({}), null);
assert.equal(calculateRMultiple({ entry: 'abc', sl: 98, close: 106 }), null, 'non-numeric');
// An absurd result means corrupt data, not a 500R winner.
assert.equal(calculateRMultiple({ entry: 100, sl: 99.999, close: 200, side: 'Buy' }), null);

// ------------------------------------------------ manual entry always wins
const manual = withDerivedR({ entry: 100, sl: 98, close: 106, side: 'Buy', resultR: 1.2 });
assert.equal(manual.resultR, 1.2, 'must never overwrite a human judgement');
assert.equal(manual.resultRSource, undefined);

const derived = withDerivedR({ entry: 100, sl: 98, close: 106, side: 'Buy' });
assert.equal(derived.resultR, 3);
assert.equal(derived.resultRSource, 'derived', 'derived values must be traceable');

// Zero is a real result and must be preserved, not treated as missing.
const zero = withDerivedR({ entry: 100, sl: 98, close: 106, side: 'Buy', resultR: 0 });
assert.equal(zero.resultR, 0);

// Nothing derivable leaves the trade untouched.
const untouched = withDerivedR({ symbol: 'XAUUSD' });
assert.equal(untouched.resultR, undefined);

// -------------------------------------------- end to end through importers
const fnData = { trades: [], openPositions: [], accounts: [{ id: 'a' }] };
const fnCsv = [
  'Ticket ID,Open Time,Open Price,Close Time,Close Price,Profit,Lots,Commission,Swap,Symbol,Type,SL,TP,Pips,Volume',
  'T1,2026.07.24 10:00:00,2000,2026.07.24 11:00:00,2030,300,0.1,-1,0,XAUUSD,Buy,1990,2050,300,10',
  'T2,2026.07.24 12:00:00,2000,2026.07.24 13:00:00,1990,-100,0.1,-1,0,XAUUSD,Buy,1990,2050,-100,10',
].join('\n');
fundedNext(fnData, fnCsv, 'a', 'fn.csv');

const t1 = fnData.trades.find((trade) => trade.ticket === 'T1');
const t2 = fnData.trades.find((trade) => trade.ticket === 'T2');
assert.equal(t1.resultR, 3, 'FundedNext winner must derive R automatically');
assert.equal(t1.resultRSource, 'derived');
assert.equal(t2.resultR, -1, 'a trade closed at the stop is exactly -1R');

// MT5 sell trade must invert correctly through the importer too.
const mtData = { trades: [], openPositions: [], accounts: [{ id: 'a' }] };
const mtCsv = [
  'Ticket,Open Time,Open Price,Close Time,Close Price,Profit,Volume,Commission,Swap,Symbol,Type,SL,TP',
  'M1,2026-07-24 10:00,1.1000,2026-07-24 11:00,1.0940,60,0.1,-1,0,EURUSD,sell,1.1020,1.0900',
].join('\n');
mt5(mtData, mtCsv, 'a', 'm.csv', false);
assert.equal(mtData.trades[0].resultR, 3, 'MT5 sell must derive +3R when price fell');
assert.equal(mtData.trades[0].resultRSource, 'derived');

// A report without stop-loss data must import cleanly with a null R.
const noSlData = { trades: [], openPositions: [], accounts: [{ id: 'a' }] };
const noSlCsv = [
  'Ticket,Open Time,Open Price,Close Time,Close Price,Profit,Volume,Commission,Swap,Symbol,Type',
  'M2,2026-07-24 10:00,1.1000,2026-07-24 11:00,1.1060,60,0.1,-1,0,EURUSD,buy',
].join('\n');
mt5(noSlData, noSlCsv, 'a', 'm2.csv', false);
assert.equal(noSlData.trades[0].resultR, null, 'no stop loss means no derivable R');
assert.equal(noSlData.trades[0].resultRSource, null);

console.log('R-Multiple QA: PASS (buy/sell direction, invalid input, manual override, importer wiring)');

// ------------------------------------------- derived R must not corrupt units
// Regression: once R is derived on import, an imported trade carries BOTH a
// currency netProfit and a derived R. Engines that aggregate money must keep
// reporting money, otherwise a $19 profit silently becomes "0.5".
const { buildAccountAnalyticsSnapshot } = require('../lib/engines/analytics');
const { buildDisciplineSnapshot } = require('../lib/engines/discipline');

const mixed = {
  accounts: [{ id: 'a' }],
  openPositions: [],
  signals: [{ SignalID: 'S1', mode: 'LIVE', decisions: { a: { status: 'ORDER_PLACED' } } }],
  trades: [
    // Imported: money is the truth, R is only derived from price.
    { accountId: 'a', signalId: 'S1', netProfit: 19, resultR: 0.5, resultRSource: 'derived', date: '2026-07-24' },
  ],
};

const money = buildAccountAnalyticsSnapshot(mixed, 'a');
assert.equal(money.totals.net, 19, 'derived R must not replace currency P&L in analytics');

const linked = buildDisciplineSnapshot(mixed, 'a').linkedPerformance;
assert.equal(linked.netResult, 19, 'derived R must not replace currency P&L in discipline');

// A manually entered R still takes precedence, as the trader intended.
const manualTrade = {
  accounts: [{ id: 'a' }],
  openPositions: [],
  signals: [],
  trades: [{ accountId: 'a', netProfit: 19, resultR: 2.5, date: '2026-07-24' }],
};
assert.equal(buildAccountAnalyticsSnapshot(manualTrade, 'a').totals.net, 2.5, 'manual R wins');

console.log('R-Multiple Unit Safety: PASS (derived R never mixes with currency aggregates)');
