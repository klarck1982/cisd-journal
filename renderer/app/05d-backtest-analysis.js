/** Compact backtest analysis: filter coverage, sessions and weekdays. */

const BACKTEST_ANALYSIS_VIEWS = ['filters', 'sessions', 'days'];

function formatOptionalPercent(value) {
  return value === null || value === undefined ? '—' : formatPercent(value);
}

function analysisSessionLabel(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return t('backtest.analysis.unknown');
  if (text === 'ny' || text.includes('new york')) return t('backtest.analysis.sessions.newYork');
  if (text.includes('london')) return t('backtest.analysis.sessions.london');
  if (text.includes('asia')) return t('backtest.analysis.sessions.asia');
  if (text.includes('after') || text.includes('closed')) return t('backtest.analysis.sessions.after');
  return value;
}

function analysisDayLabel(value) {
  const key = String(value || '').trim().toLowerCase();
  const aliases = {
    sun: 'sunday', sunday: 'sunday', mon: 'monday', monday: 'monday', tue: 'tuesday', tuesday: 'tuesday',
    wed: 'wednesday', wednesday: 'wednesday', thu: 'thursday', thursday: 'thursday', fri: 'friday', friday: 'friday',
    sat: 'saturday', saturday: 'saturday',
  };
  const day = aliases[key] || 'unknown';
  return t(`backtest.analysis.days.${day}`);
}

function analysisDayFromTimestamp(value, fallback = '') {
  if (fallback) return analysisDayLabel(fallback);
  const raw = String(value || '').trim();
  if (!raw) return t('backtest.analysis.unknown');
  const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T12:00:00` : raw);
  if (Number.isNaN(date.getTime())) return t('backtest.analysis.unknown');
  const weekday = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: model.state?.settings?.timezone || 'America/New_York',
  }).format(date);
  return analysisDayLabel(weekday);
}

function analysisSummary(entries) {
  const scored = entries.filter((entry) => entry.resultR !== null && entry.resultR !== undefined && entry.resultR !== '' && Number.isFinite(Number(entry.resultR)));
  const wins = scored.filter((entry) => entry.outcome === 'WIN' || Number(entry.resultR) > 0).length;
  const netR = scored.reduce((sum, entry) => sum + Number(entry.resultR), 0);
  return {
    count: entries.length,
    scored: scored.length,
    winRate: scored.length ? wins / scored.length : null,
    netR,
    avgR: scored.length ? netR / scored.length : null,
  };
}

function buildBacktestAnalysisRows(view, signals, manualTrades) {
  if (view === 'filters') {
    const total = signals.length || 1;
    return BACKTEST_FACTOR_KEYS.map((key) => {
      const matching = signals.filter((signal) => signal[key] === '1');
      const summary = analysisSummary(matching.map((signal) => ({ resultR: isBacktestScored(signal) ? signal.resultR : null, outcome: signal.status })));
      return { label: key, count: matching.length, coverage: matching.length / total, ...summary };
    }).sort((a, b) => b.count - a.count || (b.avgR || -Infinity) - (a.avgR || -Infinity));
  }

  const entries = [
    ...signals.map((signal) => ({
      group: view === 'days' ? analysisDayFromTimestamp(signal.signalAt, signal.Day) : analysisSessionLabel(signal.Session),
      resultR: isBacktestScored(signal) ? Number(signal.resultR) : null,
      outcome: String(signal.status || '').toUpperCase(),
    })),
    ...manualTrades.filter(isManualTradeScored).map((trade) => ({
      group: view === 'days' ? analysisDayFromTimestamp(trade.date, trade.day) : analysisSessionLabel(trade.session),
      resultR: Number(trade.resultR),
      outcome: String(trade.outcome || '').toUpperCase(),
    })),
  ];
  const groups = new Map();
  for (const entry of entries) {
    if (!groups.has(entry.group)) groups.set(entry.group, []);
    groups.get(entry.group).push(entry);
  }
  const total = entries.length || 1;
  return [...groups.entries()]
    .map(([label, group]) => ({ label, coverage: group.length / total, ...analysisSummary(group) }))
    .sort((a, b) => b.netR - a.netR || b.count - a.count);
}

function renderBacktestAnalysis(selected, signals = [], manualTrades = []) {
  const body = $('#backtestAnalysisBody');
  if (!body) return;
  const tabs = $$('[data-backtest-analysis]');
  const view = BACKTEST_ANALYSIS_VIEWS.includes(model.backtestAnalysisView) ? model.backtestAnalysisView : 'filters';
  tabs.forEach((button) => {
    button.textContent = t(`backtest.analysis.${button.dataset.backtestAnalysis}`);
    button.classList.toggle('active', button.dataset.backtestAnalysis === view);
    button.classList.toggle('blue', button.dataset.backtestAnalysis === view);
    button.classList.toggle('neutral', button.dataset.backtestAnalysis !== view);
    button.onclick = () => {
      model.backtestAnalysisView = button.dataset.backtestAnalysis;
      renderBacktestAnalysis(selected, signals, manualTrades);
    };
  });
  if (!selected) {
    body.innerHTML = emptyState(t('backtest.analysis.empty'));
    $('#backtestAnalysisSummary').innerHTML = '';
    return;
  }
  const rows = buildBacktestAnalysisRows(view, signals, manualTrades);
  if (!rows.length) {
    body.innerHTML = emptyState(t('backtest.analysis.noRows'));
    $('#backtestAnalysisSummary').innerHTML = '';
    return;
  }
  const most = rows.slice().sort((a, b) => b.count - a.count)[0];
  const best = rows.slice().filter((row) => row.avgR !== null).sort((a, b) => (b.avgR || -Infinity) - (a.avgR || -Infinity))[0];
  $('#backtestAnalysisSummary').innerHTML = `
    <span class="backtest-analysis-pill">${escapeHtml(t('backtest.analysis.mostSignals'))}: <strong>${escapeHtml(most.label)} · ${most.count}</strong></span>
    <span class="backtest-analysis-pill">${escapeHtml(t('backtest.analysis.bestPerformance'))}: <strong class="positive">${escapeHtml(best?.label || '—')} · ${best?.avgR === null || best?.avgR === undefined ? '—' : `${best.avgR > 0 ? '+' : ''}${formatNumber(best.avgR, 2)}R`}</strong></span>
    <span class="backtest-analysis-pill">${escapeHtml(t('backtest.analysis.manualCount'))}: <strong>${manualTrades.length}</strong></span>
  `;
  body.innerHTML = `<div class="backtest-analysis-table-wrap"><table class="backtest-analysis-table"><thead><tr>
    <th>${escapeHtml(t(`backtest.analysis.${view}Label`))}</th><th>${escapeHtml(t('backtest.analysis.count'))}</th><th>${escapeHtml(t('backtest.analysis.coverage'))}</th><th>${escapeHtml(t('backtest.analysis.scored'))}</th><th>Win Rate</th><th>Net R</th><th>${escapeHtml(t('backtest.analysis.avgR'))}</th><th></th>
  </tr></thead><tbody>${rows.map((row) => `<tr>
    <td><strong>${escapeHtml(row.label)}</strong></td>
    <td class="num">${row.count}</td>
    <td class="num">${formatPercent(row.coverage)}</td>
    <td class="num">${row.scored}</td>
    <td class="num">${formatOptionalPercent(row.winRate)}</td>
    <td class="num ${row.netR >= 0 ? 'positive' : 'negative'}">${row.netR > 0 ? '+' : ''}${escapeHtml(formatNumber(row.netR, 2))}R</td>
    <td class="num">${row.avgR === null ? '—' : `${row.avgR > 0 ? '+' : ''}${escapeHtml(formatNumber(row.avgR, 2))}R`}</td>
    <td><span class="backtest-analysis-bar"><i style="width:${Math.max(4, Math.min(100, row.coverage * 100))}%"></i></span></td>
  </tr>`).join('')}</tbody></table></div>`;
}
