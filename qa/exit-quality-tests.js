const assert = require('assert');
const { plannedR, classifyExit, buildExitQualitySnapshot } = require('../lib/engines/exit-quality');

// ------------------------------------------------------------- planned R
assert.equal(plannedR({ entry: 2000, sl: 1990, tp: 2030, side: 'Buy' }), 3);
assert.equal(plannedR({ entry: 2000, sl: 1990, tp: 2020, side: 'Buy' }), 2);
// Sell trades invert: the target sits below entry.
assert.equal(plannedR({ entry: 2000, sl: 2010, tp: 1970, side: 'Sell' }), 3);

// Refuse to guess rather than produce a wrong plan.
assert.equal(plannedR({ entry: 2000, sl: 1990, side: 'Buy' }), null, 'no target');
assert.equal(plannedR({ entry: 2000, tp: 2030, side: 'Buy' }), null, 'no stop');
assert.equal(plannedR({ entry: 2000, sl: 2000, tp: 2030, side: 'Buy' }), null, 'zero risk');
// A target on the wrong side of entry is corrupt data, not a plan.
assert.equal(plannedR({ entry: 2000, sl: 1990, tp: 1980, side: 'Buy' }), null);
assert.equal(plannedR({ entry: 2000, sl: 2010, tp: 2030, side: 'Sell' }), null);
assert.equal(plannedR({}), null);

// ---------------------------------------------------------- classification
const base = { entry: 2000, sl: 1990, tp: 2030, side: 'Buy' }; // planned 3R

assert.equal(classifyExit({ ...base, resultR: 3 }).type, 'target');
assert.equal(classifyExit({ ...base, resultR: 2.95 }).type, 'target', 'within tolerance counts as hit');
assert.equal(classifyExit({ ...base, resultR: 4.2 }).type, 'beyondTarget');
assert.equal(classifyExit({ ...base, resultR: 1.2 }).type, 'early');
assert.equal(classifyExit({ ...base, resultR: 0.05 }).type, 'breakeven');
assert.equal(classifyExit({ ...base, resultR: -1 }).type, 'stopped');
assert.equal(classifyExit({ ...base, resultR: -0.4 }).type, 'smallLoss');

// A trade with no plan or no result cannot be judged.
assert.equal(classifyExit({ entry: 2000, sl: 1990, resultR: 2 }).classified, false);
assert.equal(classifyExit({ ...base }).classified, false, 'no result');

// -------------------------------------------------------------- snapshot
const trade = (resultR, extra = {}) => ({ accountId: 'a', ...base, resultR, symbol: 'XAUUSD', ...extra });

const data = {
  trades: [
    trade(1.2), trade(0.9), trade(3.1), trade(-1), trade(1.4), trade(-1),
    { accountId: 'a', entry: 1.1, sl: 1.09, tp: 1.13, side: 'Buy', resultR: 0.8, symbol: 'EURUSD' },
    // Another account must not leak in.
    { accountId: 'b', ...base, resultR: 99 },
    // No target: excluded from capture maths entirely.
    { accountId: 'a', entry: 2000, sl: 1990, resultR: 5 },
  ],
};

const snapshot = buildExitQualitySnapshot(data, 'a');
assert.equal(snapshot.totals.classified, 7, 'only trades with a full plan are judged');
assert.equal(snapshot.totals.unclassified, 1);
assert.equal(snapshot.totals.winners, 5);

// Planned 15R across winners, captured 7.4R.
assert.equal(snapshot.plannedR, 15);
assert.equal(snapshot.capturedR, 7.4);
assert.equal(snapshot.targetCapture, round4(7.4 / 15));
function round4(value) { return Math.round(value * 10000) / 10000; }

// The headline number, and the habit it implies.
assert.equal(snapshot.leftOnTable, 7.7);
assert.equal(snapshot.breakdown.early, 4);
assert.equal(snapshot.breakdown.target, 1);
assert.equal(snapshot.breakdown.stopped, 2);
assert.equal(snapshot.hasEvidence, true);
assert.equal(snapshot.cutsWinnersEarly, true);

// Worst exits ranked by how much was left behind.
assert.equal(snapshot.worstExits[0].symbol, 'EURUSD');
assert.equal(snapshot.worstExits[0].shortfall, 2.2);
assert.ok(snapshot.worstExits.length <= 5);

// Losses must never be counted as leaving money on the table.
const allLosses = buildExitQualitySnapshot(
  { trades: [trade(-1), trade(-1), trade(-1), trade(-1), trade(-1)] },
  'a'
);
assert.equal(allLosses.leftOnTable, 0);
assert.equal(allLosses.targetCapture, null, 'no winners means no capture ratio');
assert.equal(allLosses.cutsWinnersEarly, false);

// A disciplined trader who lets winners run must not be accused of cutting early.
const disciplined = buildExitQualitySnapshot(
  { trades: [trade(3), trade(3.1), trade(2.95), trade(-1), trade(3.4)] },
  'a'
);
assert.equal(disciplined.cutsWinnersEarly, false);
assert.equal(disciplined.breakdown.early, 0);
assert.ok(disciplined.targetCapture >= 1, 'hitting target means full capture');

// Thin data must not produce a behavioural claim.
const thin = buildExitQualitySnapshot({ trades: [trade(1.2), trade(0.9)] }, 'a');
assert.equal(thin.hasEvidence, false);
assert.equal(thin.cutsWinnersEarly, false, 'two trades is not a habit');

// An empty account must not throw or divide by zero.
const empty = buildExitQualitySnapshot({ trades: [] }, 'a');
assert.equal(empty.totals.classified, 0);
assert.equal(empty.targetCapture, null);
assert.equal(empty.leftOnTable, 0);
assert.deepEqual(empty.worstExits, []);

console.log('Exit Quality QA: PASS (planned R, exit classification, target capture, evidence gating)');
