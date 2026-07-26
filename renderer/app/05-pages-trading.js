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
  $('#signalList').innerHTML = renderListRows(liveSignalsForAccount(), renderSignalCard);
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
  const trades = (model.state?.trades || [])
    .filter((trade) => trade.accountId === model.accountId)
    .filter((trade) => !tradeQuery || `${trade.symbol || ''} ${trade.side || ''} ${trade.source || ''} ${trade.tags || ''} ${trade.note || ''}`.toLowerCase().includes(tradeQuery))
    .slice(0, 8);

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
    </article>
  `);
}

function backtestsForAccount() {
  return (model.state?.backtests || []).filter((item) => item.accountId === model.accountId);
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
    .sort((a, b) => String(a.signalAt || '').localeCompare(String(b.signalAt || '')));
}

function renderBacktestSpotlight(selected, reviewSignals) {
  $('#backtestSpotlightTitle').textContent = t('backtest.spotlight.title');
  $('#backtestSpotlightHint').textContent = selected ? (selected.name || t('backtest.create.defaultName')) : t('backtest.spotlight.emptyHint');
  if (!selected) {
    $('#backtestSpotlightCards').innerHTML = emptyState(t('backtest.spotlight.empty'));
    $('#backtestSpotlightTags').innerHTML = '';
    return;
  }

  const reviewed = reviewSignals.filter((signal) => ['WIN', 'LOSS', 'BE', 'MISSED'].includes(String(signal.status || '').toUpperCase()));
  const scored = reviewSignals.filter((signal) => ['WIN', 'LOSS', 'BE'].includes(String(signal.status || '').toUpperCase()));
  const wins = scored.filter((signal) => String(signal.status).toUpperCase() === 'WIN').length;
  const net = scored.reduce((sum, signal) => sum + (Number(signal.resultR) || 0), 0);
  const avg = scored.length ? net / scored.length : 0;

  $('#backtestSpotlightCards').innerHTML = [
    metricCard(t('backtest.spotlight.matched'), String(reviewSignals.length), t('backtest.spotlight.matchedHint'), '', 'signals'),
    metricCard(t('backtest.spotlight.reviewed'), `${reviewed.length}/${reviewSignals.length || 0}`, t('backtest.spotlight.reviewedHint'), reviewed.length === reviewSignals.length && reviewSignals.length ? 'good' : 'warn', 'backtest'),
    metricCard(t('backtest.spotlight.winRate'), scored.length ? formatPercent(wins / scored.length) : '—', t('backtest.spotlight.winRateHint'), wins / Math.max(scored.length, 1) >= 0.5 ? 'good' : 'warn', 'analytics'),
    metricCard(t('backtest.spotlight.net'), `${net > 0 ? '+' : ''}${formatNumber(net, 2)}R`, `${t('backtest.spotlight.avg')} ${avg > 0 ? '+' : ''}${formatNumber(avg, 2)}R`, net >= 0 ? 'good' : 'bad', 'curve'),
  ].join('');

  $('#backtestSpotlightTags').innerHTML = [
    selected.filters?.start ? `<span class="tag neutral">${escapeHtml(selected.filters.start)} → ${escapeHtml(selected.filters.end || '')}</span>` : '',
    selected.filters?.session ? `<span class="tag blue">${escapeHtml(selected.filters.session)}</span>` : '',
    selected.filters?.symbol ? `<span class="tag blue">${escapeHtml(selected.filters.symbol)}</span>` : '',
    selected.filters?.tf ? `<span class="tag blue">${escapeHtml(selected.filters.tf)}</span>` : '',
  ].filter(Boolean).join('');
}

function renderBacktest() {
  const sessions = backtestsForAccount();
  const selected = selectedBacktest();
  $('#backtestSearch').value = model.search.backtest;
  if (selected) model.selectedBacktestId = selected.id;
  else model.selectedBacktestId = null;

  $('#backtestLibrary').innerHTML = renderListRows(sessions, (session) => {
    const signals = (model.state?.backtestSignals || []).filter((item) => item.backtestId === session.id);
    const reviewed = signals.filter((item) => ['WIN', 'LOSS', 'BE', 'MISSED'].includes(String(item.status || '').toUpperCase())).length;
    const isActive = session.id === selected?.id;
    return `
      <article class="item ${isActive ? 'account-card active' : ''}">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(session.name || t('backtest.create.defaultName'))}</div>
            <div class="item-subtitle">${escapeHtml(session.filters?.start || '')} → ${escapeHtml(session.filters?.end || '')}</div>
          </div>
          <span class="chip blue">${signals.length}</span>
        </div>
        <div class="item-meta">
          ${session.filters?.session ? `<span class="tag neutral">${escapeHtml(session.filters.session)}</span>` : ''}
          ${session.filters?.symbol ? `<span class="tag neutral">${escapeHtml(session.filters.symbol)}</span>` : ''}
          ${session.filters?.tf ? `<span class="tag neutral">${escapeHtml(session.filters.tf)}</span>` : ''}
          <span class="tag neutral">${reviewed}/${signals.length} ${escapeHtml(t('backtest.library.reviewed'))}</span>
        </div>
        <div class="item-actions">
          <button class="ghost" data-backtest-open="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.open'))}</button>
          <button class="ghost" data-backtest-refresh="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.refresh'))}</button>
          <button class="ghost" data-backtest-reset="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.reset'))}</button>
        </div>
      </article>
    `;
  });

  const reviewQuery = model.search.backtest.trim().toLowerCase();
  const reviewSignals = backtestSignalsForSelected().filter((signal) => !reviewQuery || `${signal.SignalID || ''} ${signal.Instrument || ''} ${signal.Direction || ''} ${signal.Session || ''} ${signal.TF || ''} ${signal.reviewNote || ''}`.toLowerCase().includes(reviewQuery));
  renderBacktestSpotlight(selected, backtestSignalsForSelected());
  $('#backtestReviewList').innerHTML = renderListRows(reviewSignals, (signal) => {
    const reviewed = ['WIN', 'LOSS', 'BE', 'MISSED'].includes(String(signal.status || '').toUpperCase());
    return `
      <article class="item signal-card ${reviewed ? (signal.status === 'MISSED' ? 'missed' : 'executed') : 'pending'}">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</div>
            <div class="item-subtitle">${escapeHtml(signal.TF || '')} · ${escapeHtml(signal.Session || '')} · ${escapeHtml(formatDateTime(signal.signalAt || signal.importedAt || ''))}</div>
          </div>
          <span class="chip ${signal.status === 'MISSED' ? 'bad' : reviewed ? 'safe' : 'warn'}">${escapeHtml(signal.status === 'NEW' ? t('signals.status.pending') : signal.status)}</span>
        </div>
        <div class="item-meta">
          ${signal.reviewNote ? `<span class="tag warn">${escapeHtml(signal.reviewNote)}</span>` : ''}
          ${signal.resultR !== null && signal.resultR !== undefined ? `<span class="tag blue">${signal.resultR > 0 ? '+' : ''}${escapeHtml(formatNumber(signal.resultR, 2))}R</span>` : ''}
        </div>
        <div class="item-actions">
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="WIN" data-result="1">${escapeHtml(t('backtest.review.statuses.win'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="LOSS" data-result="-1">${escapeHtml(t('backtest.review.statuses.loss'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="BE" data-result="0">${escapeHtml(t('backtest.review.statuses.be'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="MISSED">${escapeHtml(t('backtest.review.statuses.missed'))}</button>
        </div>
      </article>
    `;
  });

  $$('[data-backtest-open]').forEach((button) => {
    button.onclick = () => {
      model.selectedBacktestId = button.dataset.backtestOpen;
      persistUiState();
      renderBacktest();
      renderWorkspaceStatus();
    };
  });
  $$('[data-backtest-refresh]').forEach((button) => {
    button.onclick = async () => {
      await runBusy(t('ui.loading'), () => cisd.refreshBacktest(button.dataset.backtestRefresh));
      await refreshStateAndRender();
      toast(t('messages.backtestRefreshed'), 'success');
    };
  });
  $$('[data-backtest-reset]').forEach((button) => {
    button.onclick = async () => {
      const ok = await openConfirm({
        title: t('backtest.library.reset'),
        text: t('backtest.library.resetConfirm'),
        confirmLabel: t('backtest.library.reset'),
      });
      if (!ok) return;
      await runBusy(t('ui.loading'), () => cisd.resetBacktest(button.dataset.backtestReset));
      if (model.selectedBacktestId === button.dataset.backtestReset) model.selectedBacktestId = null;
      persistUiState();
      await refreshStateAndRender();
      toast(t('messages.backtestReset'), 'success');
    };
  });
  $$('[data-backtest-review]').forEach((button) => {
    button.onclick = () => {
      openBacktestReviewModal(button.dataset.backtestReview, button.dataset.status, button.dataset.result || '');
    };
  });
}

function populateFilterSelect(selectId, options, current, defaultLabel) {
  const select = $(selectId);
  if (!select) return;
  select.innerHTML = `<option value="all">${escapeHtml(defaultLabel)}</option>${options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  select.value = current || 'all';
}
