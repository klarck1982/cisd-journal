const { buildDisciplineSnapshot } = require('./discipline');
const { buildRiskSnapshot } = require('./risk');

function buildAccountDashboardSnapshot(data, accountId, options = {}) {
  const discipline = buildDisciplineSnapshot(data, accountId, options.discipline || {});
  const risk = buildRiskSnapshot(data, accountId, options.risk || {});

  return {
    accountId,
    generatedAt: new Date().toISOString(),
    discipline,
    risk,
  };
}

module.exports = {
  buildAccountDashboardSnapshot,
};
