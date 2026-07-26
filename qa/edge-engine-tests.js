const assert = require('assert');
const {
  buildEdgeSnapshot,
  buildExpectancy,
  buildRDistribution,
  buildHesitationTax,
} = require('../lib/engines/edge');

// ---------------------------------------------------------------- expectancy
const expectancy = buildExpectancy([2, -1, 3, -1, 1]);
assert.equal(expectancy.count, 5);
assert.equal(expectancy.wins, 3);
assert.equal(expectancy.losses, 2);
assert.equal(expectancy.winRate, 0.6);
assert.equal(expectancy.grossWin, 6);
assert.equal(expectancy.grossLoss, 2);
assert.equal(expectancy.net, 4);
assert.equal(expectancy.expectancy, 0.8);
assert.equal(expectancy.averageWin, 2);
assert.equal(expectancy.averageLoss, 1);
assert.equal(expectancy.payoffRatio, 2);
assert.equal(expectancy.profitFactor, 3);
// Kelly = winRate - lossRate/payoff = 0.6 - 0.4/2 = 0.4
assert.equal(expectancy.kelly, 0.4);

// A book with no losses has no payoff ratio to divide by.
const allWins = buildExpectancy([1, 2]);
assert.equal(allWins.payoffRatio, null);
assert.equal(allWins.profitFactor, null);
assert.equal(allWins.kelly, null);

// An empty book must not divide by zero.
const empty = buildExpectancy([]);
assert.equal(empty.count, 0);
assert.equal(empty.expectancy, 0);
assert.equal(empty.winRate, 0);

// -------------------------------------------------------------- distribution
const distribution = buildRDistribution([-2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 4]);
const bucket = (key) => distribution.find((item) => item.key === key).count;
assert.equal(bucket('lte-2R'), 1);
assert.equal(bucket('-2to-1R'), 1);
assert.equal(bucket('-1to0R'), 1);
assert.equal(bucket('0to1R'), 1);
assert.equal(bucket('1to2R'), 1);
assert.equal(bucket('2to3R'), 1);
assert.equal(bucket('gte3R'), 1);
assert.equal(distribution.reduce((sum, item) => sum + item.count, 0), 7);
// Boundary values land in the upper bucket, never double-counted.
const boundary = buildRDistribution([-2, -1, 0, 1, 2, 3]);
assert.equal(boundary.reduce((sum, item) => sum + item.count, 0), 6);

// ----------------------------------------------------------- hesitation tax
// The flagship metric. A missed winner is a cost; a missed loser is protection.
const discipline = {
  missedSignals: [
    { reason: 'fear', resultR: 2.5 },
    { reason: 'fear', resultR: 1.8 },
    { reason: 'news', resultR: -1.2 },
  ],
};
const tax = buildHesitationTax(discipline, null);

// Destroyed profit is reported gross, never netted against lucky escapes.
assert.equal(tax.taxR, 4.3, 'tax must count only the winners that were skipped');
assert.equal(tax.protectedR, 1.2, 'avoided losses are reported separately');
assert.equal(tax.forgoneR, 3.1, 'net forgone R');
assert.equal(tax.totalR, -3.1, 'net impact on the account is negative');
assert.equal(tax.missedCount, 3);
assert.equal(tax.hasEstimates, false, 'explicit resultR must not be treated as an estimate');

// Fear is the costly habit; news was a correct call.
assert.equal(tax.costliestReason.reason, 'fear');
assert.equal(tax.costliestReason.value, -4.3);
assert.equal(tax.costliestReason.verdict, 'costly');
assert.equal(tax.mostProtectiveReason.reason, 'news');
assert.equal(tax.mostProtectiveReason.value, 1.2);
assert.equal(tax.mostProtectiveReason.verdict, 'protective');

// When a missed signal was never reviewed, fall back to an estimate AND flag it.
const estimated = buildHesitationTax({ missedSignals: [{ reason: 'fear' }] }, 2);
assert.equal(estimated.taxR, 2);
assert.equal(estimated.hasEstimates, true);
assert.equal(estimated.estimatedCount, 1);

// With no history at all there is nothing to estimate from; report zero, not a guess.
const unknown = buildHesitationTax({ missedSignals: [{ reason: 'fear' }] }, null);
assert.equal(unknown.taxR, 0);
assert.equal(unknown.unknownCount, 1);

// Discipline with zero missed signals must be clean, not negative.
const none = buildHesitationTax({ missedSignals: [] }, 1);
assert.equal(none.taxR, 0);
assert.equal(none.costliestReason, null);

// ----------------------------------------------------------- full snapshot
const data = {
  accounts: [{ id: 'a', capital: 100000, currentBalance: 104700 }],
  openPositions: [],
  trades: [
    { accountId: 'a', signalId: 'S1', resultR: 2.1 },
    { accountId: 'a', signalId: 'S2', resultR: -1 },
    { accountId: 'a', resultR: 1.4 },
    { accountId: 'a', resultR: -1 },
    { accountId: 'a', resultR: 3.2 },
  ],
  signals: [
    { SignalID: 'S1', mode: 'LIVE', decisions: { a: { status: 'ORDER_PLACED' } } },
    { SignalID: 'S2', mode: 'LIVE', decisions: { a: { status: 'ORDER_PLACED' } } },
    { SignalID: 'S3', mode: 'LIVE', decisions: { a: { status: 'MISSED', reason: 'fear' } }, resultR: 2.5 },
    { SignalID: 'S4', mode: 'LIVE', decisions: { a: { status: 'MISSED', reason: 'fear' } }, resultR: 1.8 },
    { SignalID: 'S5', mode: 'LIVE', decisions: { a: { status: 'MISSED', reason: 'news' } }, resultR: -1.2 },
    { SignalID: 'S6', mode: 'LIVE' },
  ],
};

const snapshot = buildEdgeSnapshot(data, 'a');
assert.equal(snapshot.unit, 'R');
assert.equal(snapshot.executed.net, 4.7);
assert.equal(snapshot.hesitation.taxR, 4.3);

// The headline comparison: what was realised vs what was available.
assert.equal(snapshot.potential.realisedNet, 4.7);
assert.equal(snapshot.potential.missedNet, 3.1);
assert.equal(snapshot.potential.potentialNet, 7.8);

// Edge score must be a bounded grade, not an unbounded number.
assert.ok(snapshot.edgeScore.score >= 0 && snapshot.edgeScore.score <= 100);
assert.ok(['A', 'B', 'C', 'D', 'F'].includes(snapshot.edgeScore.grade));
for (const component of Object.values(snapshot.edgeScore.components)) {
  assert.ok(component >= 0 && component <= 100, 'every component stays within 0..100');
}

// Insights must surface the costly habit and the unreviewed backlog.
const codes = snapshot.insights.map((item) => item.code);
assert.ok(codes.includes('COSTLIEST_HESITATION'), 'must flag the most expensive reason');
assert.ok(codes.includes('PROTECTIVE_DISCIPLINE'), 'must credit correct skips');
assert.ok(codes.includes('UNREVIEWED_SIGNALS'), 'S6 was never decided');

// Accounts journalled in cash rather than R must still produce a snapshot.
const cashData = {
  accounts: [{ id: 'b' }],
  openPositions: [],
  trades: [
    { accountId: 'b', netProfit: 500 },
    { accountId: 'b', netProfit: -200 },
  ],
  signals: [],
};
const cash = buildEdgeSnapshot(cashData, 'b');
assert.equal(cash.unit, 'currency');
assert.equal(cash.executed.net, 300);

// An account with no data at all must not throw.
const blank = buildEdgeSnapshot({ accounts: [{ id: 'c' }], trades: [], signals: [], openPositions: [] }, 'c');
assert.equal(blank.executed.count, 0);
assert.equal(blank.hesitation.taxR, 0);
assert.equal(blank.potential.upliftRatio, null);

console.log('Edge Engine QA: PASS (expectancy, R distribution, hesitation tax, edge score, insights)');
