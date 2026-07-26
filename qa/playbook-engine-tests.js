const assert = require('assert');
const {
  createPlaybook,
  signalMatchesPlaybook,
  evaluateAdherence,
  buildPlaybookReport,
  buildPlaybookOverview,
} = require('../lib/engines/playbooks');

// ------------------------------------------------------------ creation shape
const playbook = createPlaybook({
  id: 'p1',
  name: 'London Gold Reversal',
  rules: ['London session', 'HTF bias aligned', 'Entry after pullback'],
  match: { session: 'London', symbol: 'xauusd' },
  maxRiskPercent: 1,
});
assert.equal(playbook.rules.length, 3);
assert.equal(playbook.rules[0].id, 'r0');
assert.equal(playbook.rules[0].required, true);
assert.equal(playbook.match.symbol, 'XAUUSD', 'symbol is normalised to upper case');
assert.ok(playbook.createdAt);

// Empty rule text is discarded rather than creating an unnameable rule.
assert.equal(createPlaybook({ rules: ['ok', '', '   '] }).rules.length, 1);
// An id is always generated.
assert.ok(createPlaybook({}).id);

// --------------------------------------------------------------- matching
const gold = { Instrument: 'XAUUSD', Session: 'London', TF: '15m', Direction: '+CISD' };
assert.equal(signalMatchesPlaybook(gold, playbook), true);
assert.equal(signalMatchesPlaybook({ ...gold, Instrument: 'EURUSD' }, playbook), false);
assert.equal(signalMatchesPlaybook({ ...gold, Session: 'New York' }, playbook), false);

// Empty criteria act as wildcards.
const anything = createPlaybook({ id: 'p2', name: 'Any', rules: ['x'] });
assert.equal(signalMatchesPlaybook(gold, anything), true);
assert.equal(signalMatchesPlaybook({ Instrument: 'NAS100' }, anything), true);

// Timeframe and direction filters.
const tfBound = createPlaybook({ id: 'p3', name: 'TF', rules: ['x'], match: { timeframe: '15m' } });
assert.equal(signalMatchesPlaybook(gold, tfBound), true);
assert.equal(signalMatchesPlaybook({ ...gold, TF: '5m' }, tfBound), false);

// ------------------------------------------------------------- adherence
const full = evaluateAdherence({ followedRules: ['r0', 'r1', 'r2'] }, playbook);
assert.equal(full.followed, true);
assert.equal(full.brokenRules.length, 0);

const partial = evaluateAdherence({ followedRules: ['r0'] }, playbook);
assert.equal(partial.followed, false);
assert.equal(partial.brokenRules.length, 2);
assert.equal(partial.followedCount, 1);

// A trade that was never classified must not be silently counted as compliant.
const unclassified = evaluateAdherence({}, playbook);
assert.equal(unclassified.classified, false);
assert.equal(unclassified.followed, false);

// A playbook without rules cannot judge adherence at all.
const ruleless = createPlaybook({ id: 'p4', name: 'No rules' });
assert.equal(evaluateAdherence({ followedRules: [] }, ruleless).classified, false);

// ---------------------------------------------------------------- report
const data = {
  playbooks: [playbook],
  trades: [
    { accountId: 'a', playbookId: 'p1', resultR: 2.4, followedRules: ['r0', 'r1', 'r2'] },
    { accountId: 'a', playbookId: 'p1', resultR: 1.8, followedRules: ['r0', 'r1', 'r2'] },
    { accountId: 'a', playbookId: 'p1', resultR: -1, followedRules: ['r0', 'r1'] },
    { accountId: 'a', playbookId: 'p1', resultR: -1.5, followedRules: ['r0'] },
    // Belongs to another account and must be excluded.
    { accountId: 'b', playbookId: 'p1', resultR: 99, followedRules: ['r0', 'r1', 'r2'] },
    // Belongs to no playbook.
    { accountId: 'a', resultR: 5 },
  ],
  signals: [
    { SignalID: 'S1', mode: 'LIVE', Instrument: 'XAUUSD', Session: 'London', decisions: { a: { status: 'MISSED', reason: 'fear' } }, resultR: 2.2 },
    { SignalID: 'S2', mode: 'LIVE', Instrument: 'XAUUSD', Session: 'London', decisions: { a: { status: 'MISSED', reason: 'fear' } } },
    { SignalID: 'S3', mode: 'LIVE', Instrument: 'XAUUSD', Session: 'London', decisions: { a: { status: 'ORDER_PLACED' } } },
    { SignalID: 'S4', mode: 'LIVE', Instrument: 'XAUUSD', Session: 'London' },
    // Different instrument: must not qualify.
    { SignalID: 'S5', mode: 'LIVE', Instrument: 'EURUSD', Session: 'London', decisions: { a: { status: 'MISSED' } } },
  ],
};

const report = buildPlaybookReport(data, playbook, 'a');

assert.equal(report.totals.trades, 4, 'other accounts and unlinked trades are excluded');
assert.equal(report.followed.count, 2);
assert.equal(report.followed.average, 2.1);
assert.equal(report.broken.count, 2);
assert.equal(report.broken.average, -1.25);
assert.equal(report.adherenceRate, 0.5);

// The number that changes behaviour: what breaking the rules costs per trade.
assert.equal(report.edgeGap, 3.35);

// Rule breaks ranked by cost, most expensive first.
assert.equal(report.ruleBreaks[0].text, 'Entry after pullback');
assert.equal(report.ruleBreaks[0].count, 2);
assert.equal(report.ruleBreaks[0].cost, -2.5);

// The differentiator: qualifying signals that were skipped, priced.
assert.equal(report.signals.qualifying, 4, 'EURUSD must not qualify');
assert.equal(report.signals.executed, 1);
assert.equal(report.signals.missed, 2);
assert.equal(report.signals.pending, 1);
// S1 is known (2.2) and S2 is estimated from the playbook's average win (2.1).
assert.equal(report.signals.missedValueR, 4.3);
assert.equal(report.signals.estimatedCount, 1);
assert.equal(report.signals.hasEstimates, true);

// ------------------------------------------------------- empty and overview
const emptyReport = buildPlaybookReport({ trades: [], signals: [] }, playbook, 'a');
assert.equal(emptyReport.totals.trades, 0);
assert.equal(emptyReport.adherenceRate, null, 'no data means no rate, not zero');
assert.equal(emptyReport.edgeGap, null);
assert.equal(emptyReport.signals.missedValueR, 0);

const second = createPlaybook({ id: 'p9', name: 'NY Breakout', rules: ['x'], match: { symbol: 'NAS100' } });
const overview = buildPlaybookOverview(
  {
    playbooks: [playbook, second],
    trades: [
      ...data.trades,
      { accountId: 'a', playbookId: 'p9', resultR: 0.4, followedRules: ['r0'] },
    ],
    signals: data.signals,
  },
  'a'
);
assert.equal(overview.count, 2);
assert.equal(overview.bestPlaybook.name, 'London Gold Reversal');
assert.equal(overview.worstPlaybook.name, 'NY Breakout');

// Archived playbooks drop out of the overview.
const archived = buildPlaybookOverview(
  { playbooks: [{ ...playbook, archived: true }], trades: [], signals: [] },
  'a'
);
assert.equal(archived.count, 0);

console.log('Playbook Engine QA: PASS (rules, matching, adherence, edge gap, missed-signal cost)');
