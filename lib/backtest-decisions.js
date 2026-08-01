/**
 * Two-way bridge with the JForex CISD indicator.
 *
 * The indicator watches `CISD_Journal_Decisions.csv` (next to its signals CSV)
 * and draws the trader's decision beside each signal on the chart:
 *   ✓ ENTERED  × SKIPPED  — IGNORED  ⌛ REVIEW (its default for unknown ids)
 *
 * This module rebuilds that file from the journal state: reviewed backtest
 * occurrences plus live signal decisions, keyed by the SignalID the indicator
 * itself generated, so labels appear in both replay and live charts.
 */

const fs = require('fs');
const path = require('path');

const DECISIONS_FILE_NAME = 'CISD_Journal_Decisions.csv';

// Journal statuses → chart vocabulary understood by the indicator.
const BACKTEST_STATUS_TO_CHART = {
  WIN: 'ENTERED',
  LOSS: 'ENTERED',
  BE: 'ENTERED',
  SKIPPED: 'SKIPPED',
  MISSED: 'IGNORED',
};

const LIVE_EXECUTED_STATUSES = new Set(['ORDER_PLACED', 'EXECUTED', 'ENTERED', 'FILLED', 'TAKEN']);

function liveStatusToChart(status) {
  const text = String(status || '').toUpperCase();
  if (!text) return '';
  if (LIVE_EXECUTED_STATUSES.has(text)) return 'ENTERED';
  if (text === 'SKIPPED') return 'SKIPPED';
  if (text === 'MISSED' || text === 'IGNORED') return 'IGNORED';
  return '';
}

/**
 * Builds the { SignalID: CHART_DECISION } map from the whole journal state.
 * Live decisions are written first so backtest reviews win on collision: the
 * replayed occurrence is the context the trader is deciding about right now.
 */
function buildDecisionRows(state = {}) {
  const rows = new Map();

  for (const signal of state.signals || []) {
    if (!signal.SignalID || !signal.decisions) continue;
    for (const decision of Object.values(signal.decisions)) {
      const chart = liveStatusToChart(decision?.status);
      if (chart) rows.set(signal.SignalID, chart);
    }
  }

  for (const occurrence of state.backtestSignals || []) {
    if (!occurrence.baseSignalId) continue;
    const chart = BACKTEST_STATUS_TO_CHART[String(occurrence.status || '').toUpperCase()];
    if (chart) rows.set(occurrence.baseSignalId, chart);
  }

  return [...rows.entries()];
}

function serializeDecisions(state) {
  const lines = ['SignalID,Decision'];
  for (const [signalId, decision] of buildDecisionRows(state)) {
    const safeId = String(signalId).replace(/[^\w\-.:+]/g, '_');
    lines.push(`${safeId},${decision}`);
  }
  return `${lines.join('\n')}\n`;
}

/**
 * Writes the decisions file next to a given signals CSV. Returns the written
 * path, or null when the target directory is unknown/unavailable. Never throws:
 * a missing bridge must never break a review save.
 */
function writeDecisionsFile(signalsCsvPath, state) {
  if (!signalsCsvPath) return null;
  try {
    const dir = path.dirname(signalsCsvPath);
    if (!dir || !fs.existsSync(dir)) return null;
    const target = path.join(dir, DECISIONS_FILE_NAME);
    fs.writeFileSync(target, serializeDecisions(state), 'utf8');
    return target;
  } catch {
    return null;
  }
}

module.exports = {
  DECISIONS_FILE_NAME,
  BACKTEST_STATUS_TO_CHART,
  buildDecisionRows,
  serializeDecisions,
  writeDecisionsFile,
};
