const assert = require('assert');
const { buildRiskSnapshot } = require('../lib/engines/risk');

const baseData = {
  accounts: [
    { id: 'a', capital: 100000, currentBalance: 97000, profitTarget: 10, dailyLoss: 3, maxDrawdown: 10 },
    { id: 'b', capital: 50000, currentBalance: 43000, profitTarget: 8, dailyLoss: 4, maxDrawdown: 10 },
  ],
  trades: [
    { accountId: 'a', date: '2026-07-26', netProfit: -500, resultR: -1 },
    { accountId: 'a', date: '2026-07-26', netProfit: -400, resultR: -0.7 },
    { accountId: 'a', date: '2026-07-25', netProfit: 300, resultR: 0.5 },
    { accountId: 'b', date: '2026-07-26', netProfit: -2200, resultR: -2 },
  ],
  openPositions: [
    { accountId: 'a', netProfit: 200 },
    { accountId: 'b', netProfit: -500 },
  ],
};

const safeish = buildRiskSnapshot(baseData, 'a', { today: '2026-07-26' });
assert.equal(safeish.state, 'ATTENTION');
assert.equal(safeish.balances.equity, 97200);
assert.equal(safeish.balances.todayClosedPnl, -900);
assert.equal(safeish.limits.dailyLossLimit, 3000);
assert.equal(safeish.limits.dailyLossRemaining, 2100);
assert.equal(safeish.limits.currentDrawdown, 3000);
assert.equal(safeish.limits.drawdownRemaining, 7000);
assert.equal(safeish.challenge.targetAmount, 10000);
assert.equal(safeish.challenge.challengeRemaining, 13000);
assert.equal(safeish.streaks.consecutiveLosses, 2);
assert.ok(safeish.warnings.some((warning) => warning.code === 'CONSECUTIVE_LOSSES'));

const breached = buildRiskSnapshot(baseData, 'b', { today: '2026-07-26' });
assert.equal(breached.state, 'BREACH');
assert.equal(breached.limits.dailyLossLimit, 2000);
assert.equal(breached.limits.dailyLossRemaining, -200);
assert.equal(breached.limits.drawdownRemaining, -2000);
assert.ok(breached.warnings.some((warning) => warning.code === 'DAILY_LOSS_LIMIT_BREACHED'));
assert.ok(breached.warnings.some((warning) => warning.code === 'MAX_DRAWDOWN_BREACHED'));

console.log('Risk Engine QA: PASS (limits, warnings, challenge progress, breach detection)');
