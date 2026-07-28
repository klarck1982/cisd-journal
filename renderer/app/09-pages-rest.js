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
  const lastSignalSync = model.state?.settings?.lastSignalSync;
  const csvPath = model.state?.settings?.csvPath;
  const accounts = model.state?.accounts || [];
  const totalSignals = (model.state?.signals || []).length;
  const todaySignals = (model.state?.signals || []).filter(s => {
    const at = s.importedAt || s.signalAt;
    if (!at) return false;
    try {
      const d = new Date(at);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    } catch { return false; }
  }).length;

  const fundedNextFolder = account?.fundedNextFolder || '';
  const fundedNextWatcherActive = !!fundedNextFolder;
  const mt5BridgeReady = model.runtimeReadiness?.mt5Bridge?.packagedExecutableExists || false;
  const newsProvider = 'Forex Factory';
  const isFreeNews = true;

  // Health score: how many sources are configured
  const configuredCount = [
    !!csvPath,
    !!fundedNextFolder,
    !!account?.lastMT5Import,
    !!(model.fundingAccess?.configured),
    !!model.newsConfigured || isFreeNews
  ].filter(Boolean).length;

  // Render top health summary if container exists, otherwise inject before sources list
  const healthContainerId = 'dataHealthCards';
  if (!document.getElementById(healthContainerId)) {
    const dataPage = document.querySelector('[data-page=\"data\"] .page-head');
    if (dataPage && !document.getElementById(healthContainerId)) {
      const healthSection = document.createElement('div');
      healthSection.id = healthContainerId;
      healthSection.className = 'metric-grid large';
      healthSection.style.marginBottom = '18px';
      dataPage.parentNode.insertBefore(healthSection, dataPage.nextSibling);
    }
  }
  const healthEl = document.getElementById(healthContainerId);
  if (healthEl) {
    healthEl.innerHTML = [
      metricCard('مصادر مهيأة', `${configuredCount}/5`, `${accounts.length} حساب`, configuredCount >= 4 ? 'good' : configuredCount >= 2 ? 'warn' : 'bad', 'source'),
      metricCard('إشارات اليوم', String(todaySignals), `إجمالي ${totalSignals}`, todaySignals > 0 ? 'good' : 'neutral', 'signals'),
      metricCard('حالة المراقبة', fundedNextWatcherActive && csvPath ? 'نشطة' : 'متوقفة', csvPath ? 'ملف CSV + مجلد FundedNext' : 'اختر ملف CSV', (fundedNextWatcherActive && csvPath) ? 'good' : 'warn', 'import'),
      metricCard('الأخبار', model.newsConfigured ? `${model.news?.length || 0} خبر` : 'قيد التحديث', 'Forex Factory · High impact', model.newsConfigured ? 'good' : 'warn', 'news'),
    ].join('');
  }

  const items = [
    {
      title: t('data.sources.cisd'),
      icon: 'signals',
      status: csvPath ? t('data.status.ready') : t('data.status.missing'),
      meta: `${csvPath ? `📁 ${csvPath.split(/[\\/]/).pop()} • ` : ''}${lastSignalSync ? `آخر فحص: ${formatDateTime(lastSignalSync)} • ` : ''}${signalDiagnostics ? `${signalDiagnostics.added} جديد • ${signalDiagnostics.duplicates} مكرر • ${signalDiagnostics.invalidRows || 0} غير صالح` : t('data.status.noRuns')}`,
      extra: `👀 المراقبة: ${csvPath ? 'نشطة كل ثانيتين' : 'متوقفة - اختر ملف'} • الإشارات اليوم: ${todaySignals}`,
      cls: csvPath ? 'blue' : 'neutral',
      actionLabel: csvPath ? 'تغيير الملف' : 'اختيار الملف',
      btnAction: 'chooseCsv',
    },
    {
      title: t('data.sources.fundedNext'),
      icon: 'source',
      status: account?.lastFundedNextImport ? formatDateTime(account.lastFundedNextImport) : fundedNextFolder ? 'يراقب...' : t('data.status.noRuns'),
      meta: `${fundedNextFolder ? `📁 ${fundedNextFolder.split(/[\\/]/).pop()} • ` : ''}${account?.lastFundedNextDiagnostics ? `${account.lastFundedNextDiagnostics.added} مضاف • ${account.lastFundedNextDiagnostics.openPositions} مفتوحة • ${account.lastFundedNextDiagnostics.duplicates || 0} مكرر` : (account?.lastFundedNextError || (fundedNextFolder ? 'في انتظار ملفات جديدة...' : t('data.status.notConfigured')))}`,
      extra: `👀 المراقبة: ${fundedNextWatcherActive ? 'نشطة' : 'متوقفة - اختر مجلد'} • الحسابات: ${accounts.filter(a=>a.fundedNextFolder).length} تراقب مجلدات`,
      cls: account?.lastFundedNextError ? 'bad' : account?.fundedNextFolder ? 'safe' : 'neutral',
      actionLabel: fundedNextFolder ? 'تغيير المجلد' : 'اختيار مجلد',
      btnAction: 'watchFolder',
    },
    {
      title: t('data.sources.mt5'),
      icon: 'import',
      status: account?.lastMT5Import ? formatDateTime(account.lastMT5Import) : t('data.status.noRuns'),
      meta: `${mt5BridgeReady ? '✅ جسر EXE جاهز • ' : '⚠️ جسر EXE مفقود • '}${account?.lastMT5Diagnostics ? `${account.lastMT5Diagnostics.added} مضاف • ${account.lastMT5Diagnostics.duplicates} مكرر • ${account.lastMT5Diagnostics.invalidRows || 0} غير صالح` : (account?.lastMT5Error || t('data.status.notConfigured'))}`,
      extra: `الصيغ: HTML/CSV • آخر خطأ: ${account?.lastMT5Error ? account.lastMT5Error.slice(0,60) : 'لا يوجد'}`,
      cls: account?.lastMT5Error ? 'bad' : account?.lastMT5Import ? 'safe' : 'neutral',
      actionLabel: 'استيراد MT5',
      btnAction: 'importMt5',
    },
    {
      title: t('data.sources.fundingAccess'),
      icon: 'link',
      status: account?.lastFundingSync ? formatDateTime(account.lastFundingSync) : (model.fundingAccess?.configured ? t('data.status.ready') : t('data.status.notConfigured')),
      meta: `${account?.lastFundingError ? `❌ ${account.lastFundingError.slice(0,80)}` : (model.fundingAccess?.mode === 'investor_pass' ? `🔑 Investor Pass • ${model.fundingAccess?.investorLogin || ''}` : model.fundingAccess?.mode === 'shared_url' ? `🔗 Shared URL • ${t('funding.modes.sharedUrl')}` : t('funding.modes.none'))}`,
      extra: `الحسابات المهيأة: ${accounts.filter(a=>a.fundingAccessMode && a.fundingAccessMode!=='none').length}/${accounts.length} • الجسر: ${mt5BridgeReady ? 'جاهز' : 'غير موجود'}`,
      cls: account?.lastFundingError ? 'bad' : model.fundingAccess?.configured ? 'safe' : 'neutral',
      actionLabel: model.fundingAccess?.configured ? 'مزامنة الآن' : 'إعداد',
      btnAction: 'syncFunding',
    },
    {
      title: '📰 الأخبار - Forex Factory',
      icon: 'news',
      status: model.newsConfigured ? `${model.news?.length || 0} خبر عالي التأثير` : 'قيد التحديث',
      meta: `✅ بدون مفتاح • ${model.news?.length ? `آخر جلب: ${formatDateTime(model.state?.settings?.lastNewsSync)} • ` : ''}${model.news?.[0] ? `التالي: ${model.news[0].Country} - ${model.news[0].Event?.slice(0,30)}` : 'لا أخبار مجدولة'}`,
      extra: model.state?.settings?.lastNewsError ? `⚠️ ${model.state.settings.lastNewsError}` : 'المصدر الوحيد للأخبار في التطبيق.',
      cls: model.state?.settings?.lastNewsError ? 'warn' : 'safe',
      actionLabel: 'تحديث الأخبار',
      btnAction: 'refreshNews',
    },
  ];

  $('#dataSourcesList').innerHTML = renderListRows(items, (item) => `
    <article class="item diagnostic-card ${item.cls}" style="padding:14px;">
      <div class="item-head">
        <div style="flex:1; min-width:0;">
          <div class="item-title with-inline-icon">${icon(item.icon,'mini-inline-icon')}${escapeHtml(item.title)}</div>
          <div class="item-subtitle" style="white-space:normal; line-height:1.5;">${escapeHtml(item.meta)}</div>
          <div class="inline-note" style="margin-top:6px; white-space:normal;">${escapeHtml(item.extra)}</div>
        </div>
        <div style="display:grid; gap:6px; justify-items:end;">
          <span class="chip ${item.cls}">${escapeHtml(item.status)}</span>
          ${item.actionLabel ? `<button class="ghost small" data-data-action="${item.btnAction}">${escapeHtml(item.actionLabel)}</button>` : ''}
        </div>
      </div>
    </article>
  `);

  // Bind data source actions
  $$('[data-data-action]').forEach(btn => {
    const act = btn.dataset.dataAction;
    if (act === 'chooseCsv') btn.onclick = () => chooseCsv();
    if (act === 'watchFolder') btn.onclick = () => watchFundedNext();
    if (act === 'importMt5') btn.onclick = () => importMt5();
    if (act === 'syncFunding') btn.onclick = () => syncFundingAccessNow();
    if (act === 'refreshNews') btn.onclick = () => loadNews(false);
    if (act === 'openSettings') btn.onclick = () => { model.page='settings'; persistUiState(); renderActivePage(); renderWorkspaceStatus(); };
  });

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
  $('#terminalPathLabel').textContent = account?.terminalPath || t('settings.noTerminal');
  const newsStatus = model.state?.settings?.lastNewsError
    ? `${t('settings.newsUpdateFailed')}: ${model.state.settings.lastNewsError}`
    : model.state?.settings?.lastNewsSync
      ? `${t('settings.newsLastSync')}: ${formatDateTime(model.state.settings.lastNewsSync)}`
      : t('settings.newsDisconnected');
  $('#newsConnectionStatus').textContent = newsStatus;
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
