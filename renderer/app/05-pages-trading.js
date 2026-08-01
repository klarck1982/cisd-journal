/**
 * Signals, trade journal and backtest pages.
 */

function allLiveSignalsForAccount() {
  return (model.state?.signals || [])
    .filter((signal) => (signal.mode || 'LIVE') === 'LIVE')
    .slice()
    .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
}

function liveSignalsForAccount() {
  const query = model.search.signals.trim().toLowerCase();
  return allLiveSignalsForAccount().filter((signal) => !query || `${signal.SignalID || ''} ${signal.Instrument || ''} ${signal.Direction || ''} ${signal.Session || ''} ${signal.TF || ''}`.toLowerCase().includes(query));
}

function renderSignalCard(signal) {
  const status = signalDisplayState(signal);
  const linkedTrade = (model.state?.trades || []).find((trade) => trade.accountId === model.accountId && trade.signalId === signal.SignalID);
  const canAct = status.key === 'pending';
  return `
    <article class="item signal-card ${status.key}">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</div>
          <div class="item-subtitle">${escapeHtml(signal.TF || '')} · ${escapeHtml(signal.Session || '')} · ${escapeHtml(formatDateTime(signal.importedAt || signal.SignalTimeNY || ''))}</div>
        </div>
        <span class="chip ${status.cls}">${escapeHtml(status.label)}</span>
      </div>
      <div class="item-meta">
        ${(signal.Grade || signal.Score) ? `<span class="tag neutral">${escapeHtml(signal.Grade || '')} ${escapeHtml(String(signal.Score || ''))}</span>` : ''}
        ${linkedTrade ? `<span class="tag safe">${escapeHtml(t('signals.linkedTrade'))}</span>` : ''}
        ${status.key === 'missed' ? `<span class="tag bad">${escapeHtml(status.decision?.reason || t('signals.reasonModal.none'))}</span>` : ''}
      </div>
      <div class="item-actions">
        ${canAct ? `<button class="ghost" data-action="entered" data-signal-id="${escapeHtml(signal.SignalID)}">${escapeHtml(t('signals.actions.entered'))}</button>` : ''}
        ${canAct ? `<button class="ghost" data-action="missed" data-signal-id="${escapeHtml(signal.SignalID)}">${escapeHtml(t('signals.actions.missed'))}</button>` : ''}
        <button class="ghost" data-action="journal" data-signal-id="${escapeHtml(signal.SignalID)}">${escapeHtml(t('signals.actions.logTrade'))}</button>
      </div>
    </article>
  `;
}

function bindSignalActions() {
  $$('[data-action="entered"]').forEach((button) => {
    button.onclick = async () => {
      const signal = (model.state?.signals || []).find((item) => item.SignalID === button.dataset.signalId);
      model.state = await runBusy(t('ui.loading'), () => cisd.signalStatus(button.dataset.signalId, model.accountId, 'ORDER_PLACED', ''));
      await refreshSnapshots();
      toast(t('messages.signalEntered'), 'success');
      openJournalForSignal(signal, 'entered');
    };
  });

  $$('[data-action="missed"]').forEach((button) => {
    button.onclick = () => openReasonModal(button.dataset.signalId);
  });

  $$('[data-action="journal"]').forEach((button) => {
    const signal = (model.state?.signals || []).find((item) => item.SignalID === button.dataset.signalId);
    if (!signal) return;
    button.onclick = () => openJournalForSignal(signal, 'link');
  });
}

function renderSignalsPage() {
  const diagnostics = model.state?.settings?.lastSignalDiagnostics;
  $('#signalsCsvPath').textContent = model.state?.settings?.csvPath || t('signals.noCsv');
  $('#signalsSearch').value = model.search.signals;
  $('#signalsSummaryCards').innerHTML = [
    metricCard(t('signals.metrics.total'), String(model.dashboard?.discipline?.totals?.signals || 0), t('signals.metrics.totalHint'), '', 'signals'),
    metricCard(t('signals.metrics.executed'), String(model.dashboard?.discipline?.totals?.executed || 0), t('signals.metrics.executedHint'), 'good', 'discipline'),
    metricCard(t('signals.metrics.missed'), String(model.dashboard?.discipline?.totals?.missed || 0), t('signals.metrics.missedHint'), 'bad', 'risk'),
    metricCard(t('signals.metrics.coverage'), formatPercent(model.dashboard?.discipline?.rates?.decisionCoverage || 0), diagnostics ? `${diagnostics.added} ${t('signals.metrics.newSignals')}` : t('signals.metrics.coverageHint'), 'warn', 'source'),
  ].join('');
  $('#signalsLiveHint').textContent = diagnostics ? `${diagnostics.added} ${t('signals.metrics.newSignals')} · ${diagnostics.duplicates} ${t('signals.metrics.duplicates')}` : t('signals.summaryHint');
  $('#signalList').innerHTML = renderListRows(
    liveSignalsForAccount(),
    renderSignalCard,
    model.search.signals.trim()
      ? { key: 'signalsFiltered', action: 'clearSignalSearch' }
      : { key: 'signals', action: 'chooseCsv' }
  );
  bindSignalActions();
}

function hydrateTradeForm(signal = model.journalPrefill) {
  if (!signal) return;
  $('#tradeSignal').value = signal.SignalID;
  $('#tradeSource').value = 'CISD';
  $('#tradeSymbol').value = signal.Instrument || '';
  $('#tradeSide').value = String(signal.Direction || '').startsWith('-') ? 'Sell' : 'Buy';
  $('#tradeDate').value = todayKey();
}

function clearJournalGuidance() {
  model.journalPrefill = null;
  model.journalGuidanceMode = null;
}

function openJournalForSignal(signal, mode = 'link') {
  if (!signal) return;
  model.page = 'journal';
  model.journalPrefill = signal;
  model.journalGuidanceMode = mode;
  persistUiState();
  render();
  hydrateTradeForm(signal);
  pulseElement('#tradeForm');
  const focusTarget = $('#tradeNote') || $('#tradeTags') || $('#tradeSymbol');
  focusTarget?.focus();
}

function renderJournalGuidance() {
  const panel = $('#journalGuidancePanel');
  if (!panel) return;
  const signal = model.journalPrefill;
  if (!signal) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  const isEntered = model.journalGuidanceMode === 'entered';
  $('#journalGuidanceTitle').textContent = isEntered ? t('journal.guidance.titleEntered') : t('journal.guidance.titleLinked');
  $('#journalGuidanceText').textContent = isEntered ? t('journal.guidance.textEntered') : t('journal.guidance.textLinked');
  $('#journalGuidanceTags').innerHTML = [
    `<span class="tag blue">${escapeHtml(signal.Instrument || '')}</span>`,
    `<span class="tag neutral">${escapeHtml(signal.Direction || '')}</span>`,
    `<span class="tag neutral">${escapeHtml(signal.TF || '')}</span>`,
    `<span class="tag ${isEntered ? 'safe' : 'warn'}">${escapeHtml(isEntered ? t('journal.guidance.enteredBadge') : t('journal.guidance.linkBadge'))}</span>`,
  ].join('');
}

function renderJournal() {
  renderJournalGuidance();
  const signals = allLiveSignalsForAccount();
  const tradeQuery = model.search.journal.trim().toLowerCase();
  const isCompact = (model.state?.settings?.dashboardDensity || model.dashboardDensity) === 'compact';
  const limit = isCompact ? 20 : 8;
  const trades = (model.state?.trades || [])
    .filter((trade) => trade.accountId === model.accountId)
    .filter((trade) => !tradeQuery || `${trade.symbol || ''} ${trade.side || ''} ${trade.source || ''} ${trade.tags || ''} ${trade.note || ''}`.toLowerCase().includes(tradeQuery))
    .slice(0, limit);

  $('#tradeSignal').innerHTML = `<option value="">${escapeHtml(t('journal.form.noSignal'))}</option>${signals.map((signal) => `<option value="${escapeHtml(signal.SignalID)}">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')} · ${escapeHtml(signal.TF || '')}</option>`).join('')}`;
  renderTradePlaybookPicker();
  $('#journalSearch').value = model.search.journal;
  $('#tradeDate').value = $('#tradeDate').value || todayKey();
  if (model.journalPrefill) hydrateTradeForm(model.journalPrefill);

  $('#recentTradesList').innerHTML = renderListRows(trades, (trade) => `
    <article class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(trade.symbol || '')} · ${escapeHtml(trade.side || '')}</div>
          <div class="item-subtitle">${escapeHtml(trade.source || '')} · ${escapeHtml(formatShortDate(trade.date || trade.createdAt))}</div>
        </div>
        <div class="${classForSigned(trade.resultR ?? trade.netProfit)}">${(Number(trade.resultR ?? trade.netProfit) || 0) > 0 ? '+' : ''}${escapeHtml(formatNumber(trade.resultR ?? trade.netProfit, 2))}${trade.resultR !== null && trade.resultR !== undefined ? 'R' : ''}</div>
      </div>
      <div class="item-meta">
        ${trade.signalId ? `<span class="tag blue">${escapeHtml(t('journal.recentTrades.linked'))}</span>` : ''}
        ${(trade.tags || '').split(',').filter(Boolean).slice(0, 3).map((tag) => `<span class="tag neutral">${escapeHtml(tag.trim())}</span>`).join('')}
      </div>
      <div class="item-actions">
        <button class="ghost small" data-trade-edit="${escapeHtml(trade.id || '')}">${escapeHtml(t('journal.edit'))}</button>
        <button class="ghost small danger" data-trade-delete="${escapeHtml(trade.id || '')}">${escapeHtml(t('journal.delete'))}</button>
      </div>
    </article>
  `, tradeQuery
    ? { key: 'tradesFiltered', action: 'clearJournalSearch' }
    : { key: 'trades', action: 'importReport' });

  bindTradeRowActions();
}


function populateFilterSelect(selectId, options, current, defaultLabel) {
  const select = $(selectId);
  if (!select) return;
  select.innerHTML = `<option value="all">${escapeHtml(defaultLabel)}</option>${options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  select.value = current || 'all';
}
