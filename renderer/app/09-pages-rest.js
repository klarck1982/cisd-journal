/**
 * Analytics, data sources, settings and the review modals.
 */

function renderAnalytics() {
  const analytics = model.analytics;
  if (!analytics) return;

  const filterLabels = {
    period: {
      all: t('analytics.filters.allTime'),
      today: t('analytics.filters.today'),
      week: t('analytics.filters.week'),
      month: t('analytics.filters.month'),
    },
    source: {
      all: t('analytics.filters.allSources'),
      manual: t('analytics.sources.manual'),
      cisd: t('analytics.sources.cisd'),
      imported: t('analytics.sources.imported'),
      backtest: t('analytics.sources.backtest'),
    },
    side: {
      all: t('analytics.filters.allSides'),
      Buy: 'Buy',
      Sell: 'Sell',
    },
    session: {
      all: t('analytics.filters.allSessions'),
      London: 'London',
      'New York': 'New York',
      After: 'After',
    },
  };
  const activeFilters = [
    model.filters.period !== 'all' ? `${t('analytics.filters.labelPeriod')}: ${filterLabels.period[model.filters.period] || model.filters.period}` : '',
    model.filters.source !== 'all' ? `${t('analytics.filters.labelSource')}: ${filterLabels.source[model.filters.source] || model.filters.source}` : '',
    model.filters.instrument !== 'all' ? `${t('analytics.filters.labelInstrument')}: ${model.filters.instrument}` : '',
    model.filters.side !== 'all' ? `${t('analytics.filters.labelSide')}: ${filterLabels.side[model.filters.side] || model.filters.side}` : '',
    model.filters.session !== 'all' ? `${t('analytics.filters.labelSession')}: ${filterLabels.session[model.filters.session] || model.filters.session}` : '',
  ].filter(Boolean);
  $('#analyticsSummaryHint').textContent = activeFilters.length ? activeFilters.join(' · ') : t('analytics.summaryHint');
  $('#analyticsFilterChips').innerHTML = activeFilters.length
    ? activeFilters.map((label) => `<span class="tag blue">${escapeHtml(label)}</span>`).join('')
    : `<span class="tag neutral">${escapeHtml(t('analytics.filterNone'))}</span>`;

  $('#analyticsSummaryCards').innerHTML = [
    metricCard(t('analytics.cards.total'), String(analytics.totals.count), t('analytics.cards.totalHint'), '', 'analytics'),
    metricCard(t('analytics.cards.winRate'), formatPercent(analytics.totals.count ? analytics.totals.wins / analytics.totals.count : 0), `${analytics.totals.wins} / ${analytics.totals.losses}`, analytics.totals.net >= 0 ? 'good' : 'bad', 'discipline'),
    metricCard(t('analytics.cards.net'), `${analytics.totals.net > 0 ? '+' : ''}${formatNumber(analytics.totals.net, 2)}`, t('analytics.cards.netHint'), analytics.totals.net >= 0 ? 'good' : 'bad', 'curve'),
    metricCard(t('analytics.cards.expectancy'), `${analytics.totals.expectancy > 0 ? '+' : ''}${formatNumber(analytics.totals.expectancy, 2)}`, t('analytics.cards.expectancyHint'), '', 'compare'),
    metricCard(t('analytics.cards.pf'), analytics.totals.profitFactor === null ? '—' : formatNumber(analytics.totals.profitFactor, 2), t('analytics.cards.pfHint'), '', 'source'),
    metricCard(t('analytics.cards.payoff'), analytics.totals.payoffRatio === null ? '—' : formatNumber(analytics.totals.payoffRatio, 2), t('analytics.cards.payoffHint'), '', 'tag'),
    metricCard(t('analytics.cards.maxDd'), formatNumber(analytics.totals.maxDrawdown, 2), t('analytics.cards.maxDdHint'), 'bad', 'risk'),
    metricCard(t('analytics.cards.currentStreak'), `${t(`analytics.streak.${analytics.totals.currentStreak.type}`)} · ${analytics.totals.currentStreak.count}`, t('analytics.cards.currentStreakHint'), '', 'session'),
  ].join('');

  $('#analyticsCurve').innerHTML = buildCurveSvg(analytics.totals.equityCurve);
  // Trades journalled in R show an R suffix; cash accounts show a bare number.
  bindCurveTooltip('#analyticsCurve', model.edge?.unit === 'R' ? 'R' : '');
  $('#analyticsCurveMeta').innerHTML = [
    { label: t('analytics.curveStats.best'), value: analytics.totals.bestResult, tone: analytics.totals.bestResult >= 0 ? 'good' : 'bad' },
    { label: t('analytics.curveStats.worst'), value: analytics.totals.worstResult, tone: analytics.totals.worstResult >= 0 ? 'good' : 'bad' },
    { label: t('analytics.curveStats.avgWin'), value: analytics.totals.avgWin, tone: analytics.totals.avgWin >= 0 ? 'good' : 'bad' },
    { label: t('analytics.curveStats.avgLoss'), value: analytics.totals.avgLoss, tone: analytics.totals.avgLoss >= 0 ? 'good' : 'bad' },
  ].map((item) => `<div class="micro-stat"><small>${escapeHtml(item.label)}</small><strong class="value-${item.tone}">${item.value > 0 ? '+' : ''}${escapeHtml(formatNumber(item.value, 2))}</strong></div>`).join('');
  renderBreakdown('#analyticsBySource', analytics.breakdowns.bySource);
  renderBreakdown('#analyticsBySession', analytics.breakdowns.bySession);
  renderBreakdown('#analyticsBySide', analytics.breakdowns.bySide);
  renderBreakdown('#analyticsByInstrument', analytics.breakdowns.byInstrument);
  renderBreakdown('#analyticsByTag', analytics.breakdowns.byTag);
  renderBreakdown('#analyticsByMonth', analytics.breakdowns.byMonth);
  renderBreakdown('#analyticsBacktestComparison', analytics.backtestComparison, 'backtest');
  renderHeatmap(analytics.heatmap);

  populateFilterSelect('#filterSource', analytics.availableFilters.sources, model.filters.source, t('analytics.filters.allSources'));
  populateFilterSelect('#filterInstrument', analytics.availableFilters.instruments, model.filters.instrument, t('analytics.filters.allInstruments'));
  populateFilterSelect('#filterSide', ['Buy', 'Sell'], model.filters.side, t('analytics.filters.allSides'));
  populateFilterSelect('#filterSession', analytics.availableFilters.sessions, model.filters.session, t('analytics.filters.allSessions'));
}

function renderData() {
  const account = activeAccount();
  const signalDiagnostics = model.state?.settings?.lastSignalDiagnostics;
  const items = [
    {
      title: t('data.sources.cisd'),
      icon: 'signals',
      status: model.state?.settings?.csvPath ? t('data.status.ready') : t('data.status.missing'),
      meta: signalDiagnostics ? `${signalDiagnostics.added} ${t('signals.metrics.newSignals')} · ${signalDiagnostics.duplicates} ${t('signals.metrics.duplicates')}` : t('data.status.noRuns'),
      cls: model.state?.settings?.csvPath ? 'blue' : 'neutral',
    },
    {
      title: t('data.sources.mt5'),
      icon: 'import',
      status: account?.lastMT5Import ? formatDateTime(account.lastMT5Import) : t('data.status.noRuns'),
      meta: account?.lastMT5Diagnostics ? `${account.lastMT5Diagnostics.added} ${t('data.labels.added')} · ${account.lastMT5Diagnostics.duplicates} ${t('signals.metrics.duplicates')}` : (account?.lastMT5Error || t('data.status.notConfigured')),
      cls: account?.lastMT5Error ? 'bad' : account?.lastMT5Import ? 'safe' : 'neutral',
    },
    {
      title: t('data.sources.fundedNext'),
      icon: 'source',
      status: account?.lastFundedNextImport ? formatDateTime(account.lastFundedNextImport) : t('data.status.noRuns'),
      meta: account?.lastFundedNextDiagnostics ? `${account.lastFundedNextDiagnostics.added} ${t('data.labels.added')} · ${account.lastFundedNextDiagnostics.openPositions} ${t('data.labels.openPositions')}` : (account?.lastFundedNextError || t('data.status.notConfigured')),
      cls: account?.lastFundedNextError ? 'bad' : account?.fundedNextFolder ? 'safe' : 'neutral',
    },
    {
      title: t('data.sources.fundingAccess'),
      icon: 'link',
      status: account?.lastFundingSync ? formatDateTime(account.lastFundingSync) : (model.fundingAccess?.configured ? t('data.status.ready') : t('data.status.notConfigured')),
      meta: account?.lastFundingError || (model.fundingAccess?.mode === 'investor_pass' ? t('funding.modes.investor') : model.fundingAccess?.mode === 'shared_url' ? t('funding.modes.sharedUrl') : t('funding.modes.none')),
      cls: account?.lastFundingError ? 'bad' : model.fundingAccess?.configured ? 'safe' : 'neutral',
    },
  ];

  $('#dataSourcesList').innerHTML = renderListRows(items, (item) => `
    <article class="item diagnostic-card ${item.cls}">
      <div class="item-head">
        <div>
          <div class="item-title with-inline-icon">${icon(item.icon,'mini-inline-icon')}${escapeHtml(item.title)}</div>
          <div class="item-subtitle">${escapeHtml(item.meta)}</div>
        </div>
        <span class="chip ${item.cls}">${escapeHtml(item.status)}</span>
      </div>
    </article>
  `);

  const history = (model.state?.importHistory || []).filter((entry) => !entry.accountId || entry.accountId === model.accountId).slice(0, 10);
  $('#dataImportHistory').innerHTML = renderListRows(history, (entry) => {
    const diagnostics = entry.diagnostics || {};
    return `
      <article class="item">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(entry.source || '')}</div>
            <div class="item-subtitle">${escapeHtml(entry.file || '')} · ${escapeHtml(formatDateTime(entry.at || ''))}</div>
          </div>
          <span class="chip blue">${escapeHtml(entry.sourceType || 'import')}</span>
        </div>
        <div class="item-meta">
          <span class="tag neutral">${escapeHtml(t('data.labels.added'))}: ${diagnostics.added ?? entry.added ?? 0}</span>
          <span class="tag neutral">${escapeHtml(t('signals.metrics.duplicates'))}: ${diagnostics.duplicates || 0}</span>
          <span class="tag neutral">${escapeHtml(t('data.labels.invalid'))}: ${diagnostics.invalidRows || 0}</span>
          ${diagnostics.openPositions ? `<span class="tag neutral">${escapeHtml(t('data.labels.openPositions'))}: ${diagnostics.openPositions}</span>` : ''}
        </div>
      </article>
    `;
  }, { key: 'imports', action: 'importReport' });
}

function toggleFundingAccessFields() {
  const mode = $('#fundingAccessModeInput')?.value || 'none';
  $$('.investor-field').forEach((el) => el.classList.toggle('hidden', mode !== 'investor_pass'));
  $$('.shared-url-field').forEach((el) => el.classList.toggle('hidden', mode !== 'shared_url'));
}

function renderSettings() {
  const account = activeAccount();
  const access = model.fundingAccess || { mode: 'none', syncScope: 'full_readonly', hasStoredPassword: false, configured: false };
  const readiness = model.runtimeReadiness?.mt5Bridge;
  $('#accountFirmInput').value = account?.firm || '';
  $('#accountNameInput').value = account?.name || '';
  $('#accountCapitalInput').value = account?.capital ?? '';
  $('#accountBalanceInput').value = account?.currentBalance ?? '';
  $('#accountCurrencyInput').value = account?.currency || 'USD';
  $('#accountPhaseInput').value = account?.phase || 'Challenge';
  $('#accountTargetInput').value = account?.profitTarget ?? '';
  $('#accountDailyLossInput').value = account?.dailyLoss ?? '';
  $('#accountMaxDrawdownInput').value = account?.maxDrawdown ?? '';

  $('#fundingAccessModeInput').value = access.mode || 'none';
  $('#fundingSyncScopeInput').value = access.syncScope || 'full_readonly';
  $('#investorLoginInput').value = access.investorLogin || '';
  $('#investorServerInput').value = access.investorServer || '';
  $('#sharedUrlInput').value = access.sharedDashboardUrl || '';
  $('#investorPasswordInput').value = '';
  toggleFundingAccessFields();
  $('#fundingAccessStatus').textContent = access.mode === 'investor_pass'
    ? (access.configured ? t('funding.statusInvestorConfigured') : t('funding.statusInvestorMissing'))
    : access.mode === 'shared_url'
      ? (access.configured ? t('funding.statusUrlConfigured') : t('funding.statusUrlMissing'))
      : t('funding.statusManualOnly');
  if (access.mode === 'investor_pass' && access.hasStoredPassword) {
    $('#fundingAccessStatus').textContent += ` · ${t('funding.passwordStored')}`;
  }
  if (access.mode === 'investor_pass' && readiness) {
    $('#fundingAccessStatus').textContent += readiness.packagedExecutableExists
      ? ` · ${t('funding.bridgeReady')}`
      : ` · ${t('funding.bridgeMissing')}`;
  }
  $('#openFundingAccessBtn').disabled = !(access.mode === 'shared_url' && access.sharedDashboardUrl);
  $('#syncFundingAccessBtn').disabled = !access.configured || (access.mode === 'investor_pass' && readiness && !readiness.packagedExecutableExists && model.runtimeReadiness?.packaged);

  $('#settingsLanguage').value = model.state?.settings?.locale || 'ar';
  $('#settingsTimezone').value = model.state?.settings?.timezone || 'America/New_York';
  $('#settingsNotifications').checked = model.state?.settings?.notifications !== false;
  $('#newsProvider').value = model.state?.settings?.newsProvider || 'FMP';
  $('#terminalPathLabel').textContent = account?.terminalPath || t('settings.noTerminal');
  $('#newsConnectionStatus').textContent = model.newsConfigured ? t('settings.newsConnected') : t('settings.newsDisconnected');
}

function renderActivePage() {
  $$('.page').forEach((page) => page.classList.toggle('active', page.dataset.page === model.page));
  $$('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.page === model.page));
  pulseActivePage();
}

function renderReasonModal() {
  const hidden = !model.reasonSignalId;
  $('#reasonModal').classList.toggle('hidden', hidden);
  if (hidden) return;

  const presets = ['hesitation', 'fear', 'news', 'late', 'rule-break'];
  $('#reasonPresets').innerHTML = presets.map((key) => `
    <button class="ghost ${model.reasonPreset === key ? 'active' : ''}" data-reason-preset="${key}">${escapeHtml(t(`signals.reasonModal.presets.${key}`))}</button>
  `).join('');
  $$('[data-reason-preset]').forEach((button) => {
    button.onclick = () => {
      model.reasonPreset = button.dataset.reasonPreset;
      renderReasonModal();
    };
  });
}

function backtestSignalById(signalId) {
  return (model.state?.backtestSignals || []).find((item) => item.id === signalId) || null;
}

function openBacktestReviewModal(signalId, presetStatus = 'WIN', presetResult = '') {
  const signal = backtestSignalById(signalId);
  if (!signal) return;
  model.backtestReviewSignalId = signalId;
  model.backtestReviewStatus = presetStatus;
  $('#backtestReviewResultInput').value = presetResult;
  $('#backtestReviewNoteInput').value = signal.reviewNote || '';
  renderBacktestReviewModal();
}

function closeBacktestReviewModal() {
  model.backtestReviewSignalId = null;
  model.backtestReviewStatus = 'WIN';
  $('#backtestReviewResultInput').value = '';
  $('#backtestReviewNoteInput').value = '';
  renderBacktestReviewModal();
}

function renderBacktestReviewModal() {
  const hidden = !model.backtestReviewSignalId;
  $('#backtestReviewModal').classList.toggle('hidden', hidden);
  if (hidden) return;

  const signal = backtestSignalById(model.backtestReviewSignalId);
  if (!signal) {
    closeBacktestReviewModal();
    return;
  }

  $('#backtestReviewSignalSummary').innerHTML = `
    <div class="review-summary-title">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</div>
    <div class="review-summary-meta">
      <span class="tag neutral">${escapeHtml(signal.TF || '')}</span>
      <span class="tag neutral">${escapeHtml(signal.Session || '')}</span>
      <span class="tag blue">${escapeHtml(formatDateTime(signal.signalAt || signal.importedAt || ''))}</span>
      ${signal.SignalID ? `<span class="tag neutral">ID: ${escapeHtml(signal.SignalID)}</span>` : ''}
    </div>
  `;

  const statuses = [
    { key: 'WIN', label: t('backtest.review.statuses.win'), cls: 'win', defaultResult: '1' },
    { key: 'LOSS', label: t('backtest.review.statuses.loss'), cls: 'loss', defaultResult: '-1' },
    { key: 'BE', label: t('backtest.review.statuses.be'), cls: 'be', defaultResult: '0' },
    { key: 'MISSED', label: t('backtest.review.statuses.missed'), cls: 'missed', defaultResult: '' },
  ];
  $('#backtestReviewStatusButtons').innerHTML = statuses.map((status) => `
    <button class="ghost ${status.cls} ${model.backtestReviewStatus === status.key ? 'active' : ''}" data-review-status="${status.key}" data-default-result="${status.defaultResult}">${escapeHtml(status.label)}</button>
  `).join('');

  const resultInput = $('#backtestReviewResultInput');
  resultInput.disabled = model.backtestReviewStatus === 'MISSED';
  if (model.backtestReviewStatus === 'MISSED') resultInput.value = '';

  $$('[data-review-status]').forEach((button) => {
    button.onclick = () => {
      model.backtestReviewStatus = button.dataset.reviewStatus;
      if (model.backtestReviewStatus !== 'MISSED' && !$('#backtestReviewResultInput').value) {
        $('#backtestReviewResultInput').value = button.dataset.defaultResult || '';
      }
      renderBacktestReviewModal();
    };
  });
}

async function saveBacktestReviewFromModal() {
  const signal = backtestSignalById(model.backtestReviewSignalId);
  if (!signal) return;
  const status = model.backtestReviewStatus;
  const note = $('#backtestReviewNoteInput').value.trim();
  const resultValue = $('#backtestReviewResultInput').value.trim();
  if (status !== 'MISSED' && resultValue === '') {
    toast(t('backtest.review.resultRequired'), 'warn');
    return;
  }
  await runBusy(t('ui.loading'), () => cisd.reviewBacktestSignal(model.backtestReviewSignalId, {
    status,
    resultR: status === 'MISSED' ? null : Number(resultValue || 0),
    note,
  }));
  await refreshStateAndRender();
  closeBacktestReviewModal();
  toast(t('messages.backtestReviewed'), 'success');
}
