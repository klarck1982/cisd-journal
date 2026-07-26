const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { parseFundingPipsSharedText } = require('../lib/funding-shared-parser');

const sample = fs.readFileSync(path.join(__dirname, 'fixtures', 'fundingpips-shared-sample.txt'), 'utf8');
const result = parseFundingPipsSharedText(sample, [[
  ['Symbol','Type','Open Date','Open','Closed Date','Closed','TP','SL','Lots','Commission','Profit'],
  ['SPX500','Sell','7/24/2026, 02:47','7400.53','7/24/2026, 02:50','7399.08','-','7425.12','0.01','$0.00','$0.73']
]]);

assert.equal(result.owner, 'Maram M');
assert.equal(result.accountSize, 25000);
assert.equal(result.todayProfit, -33.87);
assert.equal(result.score, 41.55);
assert.equal(result.balance, 24966.13);
assert.equal(result.balanceMax, 25005.24);
assert.equal(result.equity, 24966.13);
assert.equal(result.equityMax, 25024.16);
assert.equal(result.startDate, 'Mar 16, 2026');
assert.equal(result.totalTrades, 54);
assert.equal(result.totalLots, 1.32);
assert.equal(result.winRatio, 48);
assert.equal(result.averageWin, 17.07);
assert.equal(result.averageLoss, -17.06);
assert.equal(result.profitFactor, 0.93);
assert.equal(result.biggestWin, 56.28);
assert.equal(result.biggestLoss, -61.62);
assert.equal(result.phase, 'Phase 1');
assert.equal(result.platform, 'Meta Trader 5');
assert.equal(result.closedTrades.length, 1);
assert.equal(result.closedTrades[0].Symbol, 'SPX500');

console.log('Funding Shared Parser QA: PASS (FundingPips shared dashboard parsing)');
