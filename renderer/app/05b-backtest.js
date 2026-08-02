/**
 * Backtest workspace: compact session bar, signal queue, current review card,
 * capture diagnostics and the independent manual-trade action.
 */
const BACKTEST_SCORED_STATUSES = new Set(['WIN', 'LOSS', 'BE']);
const BACKTEST_REVIEWED_STATUSES = new Set(['WIN', 'LOSS', 'BE', 'MISSED', 'SKIPPED']);
const BACKTEST_FACTOR_KEYS = ['Trend', 'Fib', 'MS', 'HTF', 'MomVol', 'Confirmed'];

function backtestsForAccount() {
  return (model.state?.backtests || [])
    .filter((item) => item.accountId === model.accountId)
    .filter((item) => item.status !== 'ARCHIVED');
}

function selectedBacktest() {
  const sessions = backtestsForAccount();
  const selected = sessions.find((item) => item.id === model.selectedBacktestId);
  return selected || sessions[0] || null;
}

function backtestSignalsForSelected() {
  const selected = selectedBacktest();
  if (!selected) return [];
  return (model.state?.backtestSignals || [])
    .filter((item) => item.backtestId === selected.id)
    .slice()
    .sort((a, b) => String(a.signalAt || a.importedAt || '').localeCompare(String(b.signalAt || b.importedAt || '')));
}

function manualTradesForSelected() {
  const selected = selectedBacktest();
  if (!selected) return [];
  return (model.state?.trades || [])
    .filter((item) => item.accountId === model.accountId && item.backtestId === selected.id)
    .slice()
    .sort((a, b) => String(a.date || a.createdAt || '').localeCompare(String(b.date || b.createdAt || '')));
}

function backtestSignalById(signalId) {
  return (model.state?.backtestSignals || []).find((item) => item.id === signalId) || null;
}

function isBacktestScored(signal) {
  return BACKTEST_SCORED_STATUSES.has(String(signal?.status || '').toUpperCase())
    && signal?.resultR !== null
    && signal?.resultR !== undefined
    && signal?.resultR !== ''
    && Number.isFinite(Number(signal.resultR));
}

function isManualTradeScored(trade) {
  return trade?.resultR !== null && trade?.resultR !== undefined && trade?.resultR !== '' && Number.isFinite(Number(trade.resultR));
}

function backtestStatusLabel(status) {
  const key = String(status || 'NEW').toUpperCase();
  if (key === 'NEW') return t('signals.status.pending');
  if (key === 'WIN') return t('backtest.review.statuses.win');
  if (key === 'LOSS') return t('backtest.review.statuses.loss');
  if (key === 'BE') return t('backtest.review.statuses.be');
  if (key === 'SKIPPED') return t('backtest.review.statuses.skipped');
  if (key === 'MISSED') return t('backtest.review.statuses.missed');
  return key;
}

function backtestCaptureView(session) {
  const diagnostics = session?.captureDiagnostics || {};
  const state = String(diagnostics.status || (session?.status === 'ACTIVE' ? 'WAITING' : 'IDLE')).toLowerCase();
  const cls = state === 'error' ? 'bad' : state === 'missing' ? 'warn' : state === 'ready' ? 'safe' : 'neutral';
  const sourcePath = diagnostics.sourcePath || session?.backtestCsvPath || session?.sourceCsvPath || '';
  const sourceName = sourcePath ? sourcePath.split(/[\\/]/).pop() : '—';
  return { diagnostics, state, cls, label: t(`backtest.capture.status.${state}`), sourcePath, sourceName };
}

function buildBacktestCurvePoints(signals, manualTrades = []) {
  const entries = [
    ...signals.filter(isBacktestScored).map((signal) => ({ at: signal.signalAt || signal.importedAt || '', result: Number(signal.resultR) || 0 })),
    ...manualTrades.filter(isManualTradeScored).map((trade) => ({ at: trade.date || trade.createdAt || '', result: Number(trade.resultR) || 0 })),
  ].sort((a, b) => String(a.at).localeCompare(String(b.at)));
  let equity = 0;
  return entries.map((entry) => {
    equity += entry.result;
    return { ...entry, equity };
  });
}

function renderBacktestSessionBar(sessions, selected) {
  const select = $('#backtestSessionSelect');
  if (!select) return;
  select.innerHTML = sessions.length
    ? sessions.map((session) => `<option value="${escapeHtml(session.id)}">${escapeHtml(session.name || t('backtest.create.defaultName'))}</option>`).join('')
    : `<option value="">${escapeHtml(t('backtest.spotlight.emptyHint'))}</option>`;
  select.value = selected?.id || '';
  const status = $('#backtestSessionStatus');
  if (status) {
    const capture = selected ? backtestCaptureView(selected) : null;
    status.innerHTML = selected
      ? `<span class="chip ${selected.status === 'FINISHED' ? 'neutral' : 'green'}">${escapeHtml(selected.status === 'FINISHED' ? t('backtest.status.finished') : t('backtest.status.active'))}</span>
         <span class="backtest-session-source ${capture.cls}" title="${escapeHtml(capture.diagnostics.lastError || capture.sourcePath)}"><i></i>${escapeHtml(capture.label)}</span>`
      : '';
  }
  const actions = $('#backtestSessionActions');
  if (!actions) return;
  if (!selected) {
    actions.innerHTML = '';
    return;
  }
  const captureEnabled = selected.status === 'ACTIVE';
  const capturing = captureEnabled && selected.captureEnabled !== false;
  actions.innerHTML = `
    <span class="backtest-session-path" title="${escapeHtml(selected.sourceCsvPath || selected.backtestCsvPath || '')}">${escapeHtml(backtestCaptureView(selected).sourceName)}</span>
    <span class="backtest-action-spacer"></span>
    <button class="ghost small" data-backtest-refresh="${escapeHtml(selected.id)}">${escapeHtml(t('backtest.library.refresh'))}</button>
    ${captureEnabled ? `<button class="ghost small ${capturing ? 'active' : ''}" data-backtest-capture="${escapeHtml(selected.id)}" data-enabled="${capturing ? '0' : '1'}">${escapeHtml(capturing ? t('backtest.library.captureStop') : t('backtest.library.captureStart'))}</button>` : ''}
    ${captureEnabled ? `<button class="ghost small" data-backtest-stop="${escapeHtml(selected.id)}">${escapeHtml(t('backtest.library.stop'))}</button>` : ''}
    <button class="ghost small" data-backtest-edit="${escapeHtml(selected.id)}">${escapeHtml(t('backtest.library.edit'))}</button>
    <button class="ghost small" data-backtest-archive="${escapeHtml(selected.id)}">${escapeHtml(t('backtest.library.archive'))}</button>
    <button class="ghost small danger" data-backtest-reset="${escapeHtml(selected.id)}">${escapeHtml(t('backtest.library.delete'))}</button>
  `;
}

function renderBacktestFilterBar(selected) {
  const tags = $('#backtestSpotlightTags');
  const drawer = $('#backtestFilterDrawer');
  const toggle = $('#backtestFilterToggleBtn');
  if (!tags || !drawer) return;
  if (!selected) {
    tags.innerHTML = '';
    drawer.innerHTML = '';
    return;
  }
  const filters = selected.filters || {};
  const capture = backtestCaptureView(selected);
  const chips = [
    filters.start || filters.end ? `<span class="chip neutral">${escapeHtml(filters.start || '—')} → ${escapeHtml(filters.end || '—')}</span>` : '',
    filters.symbol ? `<span class="chip neutral">${escapeHtml(filters.symbol)}</span>` : '',
    filters.tf ? `<span class="chip neutral">${escapeHtml(filters.tf)}</span>` : '',
    filters.session ? `<span class="chip neutral">${escapeHtml(filters.session)}</span>` : `<span class="chip neutral">${escapeHtml(t('analytics.filters.allSessions'))}</span>`,
  ].filter(Boolean).join('');
  tags.innerHTML = chips;
  if (toggle) toggle.textContent = `${t('backtest.filters.button')} · ${[filters.start, filters.end, filters.symbol, filters.tf, filters.session].filter(Boolean).length}`;
  drawer.innerHTML = `
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.source'))}</span><strong>${escapeHtml(backtestCaptureView(selected).sourceName)}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.period'))}</span><strong>${escapeHtml(filters.start || '—')} → ${escapeHtml(filters.end || '—')}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.instrument'))}</span><strong>${escapeHtml(filters.symbol || '—')}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.timeframe'))}</span><strong>${escapeHtml(filters.tf || '—')}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.session'))}</span><strong>${escapeHtml(filters.session || t('analytics.filters.allSessions'))}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.scanned'))}</span><strong class="num">${capture.diagnostics.scannedRows || 0}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.added'))}</span><strong class="num">${capture.diagnostics.added || 0}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.skipped'))}</span><strong class="num">${capture.diagnostics.skippedRows || 0}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.invalid'))}</span><strong class="num">${capture.diagnostics.invalidRows || 0}</strong></div>
    <div class="backtest-filter-detail"><span>${escapeHtml(t('backtest.filters.duplicates'))}</span><strong class="num">${capture.diagnostics.duplicates || 0}</strong></div>
  `;
}

function renderBacktestSpotlight(selected, signals, manualTrades) {
  const title = $('#backtestSpotlightTitle');
  const hint = $('#backtestSpotlightHint');
  if (title) title.textContent = t('backtest.spotlight.title');
  if (hint) hint.textContent = selected ? (selected.name || t('backtest.create.defaultName')) : t('backtest.spotlight.emptyHint');
  if (!selected) {
    $('#backtestSpotlightCards').innerHTML = emptyState(t('backtest.spotlight.empty'));
    $('#backtestSpotlightTags').innerHTML = '';
    return;
  }
  const reviewed = signals.filter((signal) => BACKTEST_REVIEWED_STATUSES.has(String(signal.status || '').toUpperCase()));
  const scoredSignals = signals.filter(isBacktestScored);
  const scoredManual = manualTrades.filter(isManualTradeScored);
  const allScored = [...scoredSignals, ...scoredManual];
  const wins = scoredSignals.filter((signal) => String(signal.status).toUpperCase() === 'WIN').length
    + scoredManual.filter((trade) => String(trade.outcome || '').toUpperCase() === 'WIN' || Number(trade.resultR) > 0).length;
  const net = allScored.reduce((sum, entry) => sum + (Number(entry.resultR) || 0), 0);
  const avg = allScored.length ? net / allScored.length : 0;
  $('#backtestSpotlightCards').innerHTML = [
    metricCard(t('backtest.spotlight.matched'), String(signals.length), t('backtest.spotlight.matchedHint'), '', 'signals'),
    metricCard(t('backtest.spotlight.reviewed'), `${reviewed.length}/${signals.length || 0}`, t('backtest.spotlight.reviewedHint'), reviewed.length === signals.length && signals.length ? 'good' : 'warn', 'backtest'),
    metricCard(t('backtest.spotlight.winRate'), allScored.length ? formatPercent(wins / allScored.length) : '—', `${scoredManual.length} ${t('backtest.manual.countShort')}`, wins / Math.max(allScored.length, 1) >= 0.5 ? 'good' : 'warn', 'analytics'),
    metricCard(t('backtest.spotlight.net'), `${net > 0 ? '+' : ''}${formatNumber(net, 2)}R`, `${t('backtest.spotlight.avg')} ${avg > 0 ? '+' : ''}${formatNumber(avg, 2)}R`, net >= 0 ? 'good' : 'bad', 'curve'),
  ].join('');
  const curveHost = $('#backtestCurve');
  if (curveHost) {
    const points = buildBacktestCurvePoints(signals, manualTrades);
    curveHost.innerHTML = points.length
      ? `<div class="curve-title">${escapeHtml(t('backtest.curve.title'))}</div>${buildCurveSvg(points)}`
      : `<div class="panel-hint">${escapeHtml(t('backtest.curve.empty'))}</div>`;
    if (points.length) bindCurveTooltip('#backtestCurve', 'R');
  }
}

function renderBacktestQueue(signals, allSignals) {
  const count = $('#backtestReviewCount');
  if (count) count.textContent = `${signals.length}/${allSignals.length}`;
  $('#backtestReviewList').innerHTML = renderListRows(signals, (signal) => {
    const status = String(signal.status || 'NEW').toUpperCase();
    const active = signal.id === model.selectedBacktestSignalId;
    const rowCls = status === 'MISSED' || status === 'SKIPPED' ? 'missed' : BACKTEST_REVIEWED_STATUSES.has(status) ? 'executed' : 'pending';
    return `<article class="backtest-queue-row ${rowCls} ${active ? 'active' : ''}" data-backtest-focus="${escapeHtml(signal.id)}">
      <div class="backtest-queue-row-head"><div><strong>${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</strong><small>${escapeHtml(formatDateTime(signal.signalAt || signal.importedAt || ''))}</small></div><span class="chip ${status === 'NEW' ? 'yellow' : status === 'WIN' || status === 'LOSS' || status === 'BE' ? 'green' : 'neutral'}">${escapeHtml(backtestStatusLabel(status))}</span></div>
      <div class="backtest-queue-row-meta"><span>${escapeHtml(signal.Session || '')}</span><span>${escapeHtml(signal.TF || '')}</span>${signal.resultR !== null && signal.resultR !== undefined ? `<span class="num">${signal.resultR > 0 ? '+' : ''}${escapeHtml(formatNumber(signal.resultR, 2))}R</span>` : ''}</div>
    </article>`;
  }, 'backtestSignals');
}

function renderBacktestCurrent(signal) {
  const body = $('#backtestCurrentSignal');
  const title = $('#backtestCurrentTitle');
  const hint = $('#backtestCurrentHint');
  const status = $('#backtestCurrentStatus');
  if (!body) return;
  if (!signal) {
    if (title) title.textContent = t('backtest.current.title');
    if (hint) hint.textContent = t('backtest.current.emptyHint');
    if (status) status.textContent = '';
    body.innerHTML = emptyState(t('backtest.current.empty'));
    return;
  }
  const state = String(signal.status || 'NEW').toUpperCase();
  if (title) title.textContent = t('backtest.current.title');
  if (hint) hint.textContent = `${formatDateTime(signal.signalAt || signal.importedAt || '')} · ${signal.Session || ''}`;
  if (status) {
    status.textContent = backtestStatusLabel(state);
    status.className = `chip ${state === 'NEW' ? 'yellow' : state === 'MISSED' || state === 'SKIPPED' ? 'neutral' : 'green'}`;
  }
  const factorTags = BACKTEST_FACTOR_KEYS.filter((key) => signal[key] === '1').map((key) => `<span class="tag safe">${escapeHtml(key)}</span>`).join('');
  body.innerHTML = `<div class="backtest-current-hero"><div><h3>${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</h3><p>${escapeHtml(signal.TF || '')} · ${escapeHtml(signal.Session || '')} · ${escapeHtml(formatDateTime(signal.signalAt || signal.importedAt || ''))}</p></div><div class="tag-cloud">${signal.Grade ? `<span class="tag blue">${escapeHtml(signal.Grade)}</span>` : ''}${signal.Score && signal.Score !== '-' ? `<span class="tag neutral">Score ${escapeHtml(signal.Score)}</span>` : ''}</div></div>
    <div class="backtest-factor-line">${factorTags || `<span class="panel-hint">${escapeHtml(t('backtest.current.noFactors'))}</span>`}</div>
    <div class="backtest-decision-label">${escapeHtml(t('backtest.current.decision'))}</div>
    <div class="backtest-decision-row"><button class="ghost ${['WIN', 'LOSS', 'BE'].includes(state) ? 'active' : ''}" data-backtest-decision="ENTERED" data-backtest-review="${escapeHtml(signal.id)}">${escapeHtml(t('backtest.current.entered'))}</button><button class="ghost ${state === 'SKIPPED' ? 'active' : ''}" data-backtest-decision="SKIPPED" data-backtest-review="${escapeHtml(signal.id)}">${escapeHtml(t('backtest.current.skipped'))}</button><button class="ghost ${state === 'MISSED' ? 'active' : ''}" data-backtest-decision="MISSED" data-backtest-review="${escapeHtml(signal.id)}">${escapeHtml(t('backtest.current.missed'))}</button></div>
    <div class="backtest-current-note">${signal.reviewNote ? `<span class="tag warn">${escapeHtml(signal.reviewNote)}</span>` : `<span class="panel-hint">${escapeHtml(t('backtest.current.noteHint'))}</span>`}</div>`;
}

function bindBacktestWorkspaceActions() {
  const sessionSelect = $('#backtestSessionSelect');
  if (sessionSelect) sessionSelect.onchange = (event) => {
    model.selectedBacktestId = event.target.value || null;
    model.selectedBacktestSignalId = null;
    persistUiState();
    renderBacktest();
    renderWorkspaceStatus();
  };
  const filterToggle = $('#backtestFilterToggleBtn');
  if (filterToggle) filterToggle.onclick = () => $('#backtestFilterDrawer')?.classList.toggle('hidden');
  $$('[data-backtest-focus]').forEach((row) => {
    row.onclick = () => { model.selectedBacktestSignalId = row.dataset.backtestFocus; renderBacktest(); };
  });
  $$('[data-backtest-review]').forEach((button) => {
    button.onclick = (event) => { event.stopPropagation(); openBacktestReviewModal(button.dataset.backtestReview, button.dataset.backtestDecision || 'ENTERED'); };
  });
  $$('[data-backtest-refresh]').forEach((button) => {
    button.onclick = async () => { await runBusy(t('ui.loading'), () => cisd.refreshBacktest(button.dataset.backtestRefresh)); await refreshStateAndRender(); toast(t('messages.backtestRefreshed'), 'success'); };
  });
  $$('[data-backtest-edit]').forEach((button) => { button.onclick = () => openBacktestFormModal(button.dataset.backtestEdit); });
  $$('[data-backtest-capture]').forEach((button) => {
    button.onclick = async () => { const enable = button.dataset.enabled === '1'; await runBusy(t('ui.loading'), () => cisd.setBacktestCapture(button.dataset.backtestCapture, enable)); await refreshStateAndRender(); toast(enable ? t('backtest.library.captureStarted') : t('backtest.library.captureStopped'), 'success'); };
  });
  $$('[data-backtest-stop]').forEach((button) => {
    button.onclick = async () => { const ok = await openConfirm({ title: t('backtest.library.stop'), text: t('backtest.library.stopConfirm'), confirmLabel: t('backtest.library.stop') }); if (!ok) return; await runBusy(t('ui.loading'), () => cisd.stopBacktest(button.dataset.backtestStop)); await refreshStateAndRender(); toast(t('backtest.library.stopped'), 'success'); };
  });
  $$('[data-backtest-archive]').forEach((button) => {
    button.onclick = async () => { const ok = await openConfirm({ title: t('backtest.library.archive'), text: t('backtest.library.archiveConfirm'), confirmLabel: t('backtest.library.archive') }); if (!ok) return; await runBusy(t('ui.loading'), () => cisd.archiveBacktest(button.dataset.backtestArchive)); model.selectedBacktestId = null; persistUiState(); await refreshStateAndRender(); toast(t('backtest.library.archived'), 'success'); };
  });
  $$('[data-backtest-reset]').forEach((button) => {
    button.onclick = async () => { const ok = await openConfirm({ title: t('backtest.library.delete'), text: t('backtest.library.deleteConfirm'), confirmLabel: t('backtest.library.delete') }); if (!ok) return; await runBusy(t('ui.loading'), () => cisd.resetBacktest(button.dataset.backtestReset)); model.selectedBacktestId = null; model.selectedBacktestSignalId = null; persistUiState(); await refreshStateAndRender(); toast(t('messages.backtestReset'), 'success'); };
  });
}

function renderBacktest() {
  const sessions = backtestsForAccount();
  const selected = selectedBacktest();
  if (selected) model.selectedBacktestId = selected.id;
  else { model.selectedBacktestId = null; model.selectedBacktestSignalId = null; }
  const signals = backtestSignalsForSelected();
  const manualTrades = manualTradesForSelected();
  const query = model.search.backtest.trim().toLowerCase();
  const filtered = signals.filter((signal) => !query || `${signal.SignalID || ''} ${signal.Instrument || ''} ${signal.Direction || ''} ${signal.Session || ''} ${signal.TF || ''} ${signal.reviewNote || ''}`.toLowerCase().includes(query));
  let current = signals.find((signal) => signal.id === model.selectedBacktestSignalId);
  if (!current) { current = signals[0] || null; if (current) model.selectedBacktestSignalId = current.id; }
  $('#backtestSearch').value = model.search.backtest;
  renderBacktestSessionBar(sessions, selected);
  renderBacktestFilterBar(selected);
  renderBacktestSpotlight(selected, signals, manualTrades);
  renderBacktestQueue(filtered, signals);
  renderBacktestCurrent(current);
  if (typeof renderBacktestAnalysis === 'function') renderBacktestAnalysis(selected, signals, manualTrades);
  bindBacktestWorkspaceActions();
}
