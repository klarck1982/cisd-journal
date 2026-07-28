/**
 * Sidebar accounts, dashboard hero, quick-start checklist and overview page.
 */

function renderAccounts() {
  const currentDashboard = model.dashboard;
  $('#overviewAccountLabel').textContent = activeAccount()?.firm || '—';
  $('#accountRail').innerHTML = renderListRows(visibleAccounts(), (account) => {
    const isActive = account.id === model.accountId;
    const tone = isActive ? 'active' : '';
    const balance = formatCurrency(account.currentBalance || 0, account.currency || 'USD');
    const capital = account.capital ? formatCurrency(account.capital, account.currency || 'USD') : t('ui.noValue');
    const riskState = isActive && currentDashboard ? riskChip(currentDashboard.risk.state) : { cls: 'neutral', label: account.phase || '—' };
    return `
      <button class="account-card ${tone}" data-account-id="${escapeHtml(account.id)}">
        <div class="account-top">
          <div>
            <div class="account-name">${escapeHtml(account.firm || t('ui.unknown'))}</div>
            <div class="account-meta">${escapeHtml(account.name || '')}</div>
          </div>
          <span class="mini-chip">${escapeHtml(account.phase || 'Challenge')}</span>
        </div>
        <div class="account-stats">
          <span class="mini-chip">${escapeHtml(t('overview.health.capital'))}: ${escapeHtml(capital)}</span>
          <span class="mini-chip">${escapeHtml(t('overview.health.balance'))}: ${escapeHtml(balance)}</span>
          <span class="mini-chip ${riskState.cls}">${escapeHtml(riskState.label)}</span>
        </div>
      </button>
    `;
  });

  $$('.account-card').forEach((button) => {
    button.onclick = async () => {
      model.accountId = button.dataset.accountId;
      persistUiState();
      await refreshFundingAccess();
      await refreshSnapshots();
      render();
    };
  });
}

function renderOverviewHero(account, dashboard) {
  const zone = model.state?.settings?.timezone || 'America/New_York';
  const now = new Date();
  const nextNews = model.news[0] || null;
  const insightTone = dashboard.risk.state === 'BREACH' ? 'bad' : dashboard.discipline.score >= 70 ? 'good' : dashboard.discipline.score >= 40 ? 'warn' : 'bad';
  const insightText = dashboard.risk.state === 'BREACH'
    ? t('overview.hero.insightBreach')
    : dashboard.discipline.totals.missed > 0
      ? t('overview.hero.insightMissed', { count: dashboard.discipline.totals.missed })
      : t('overview.hero.insightStable');

  $('#overviewHeroKicker').textContent = t('overview.hero.kicker');
  $('#overviewHeroTitle').textContent = account.name || account.firm || t('ui.unknown');
  $('#overviewHeroText').textContent = t('overview.hero.description');
  $('#overviewHeroTimeLabel').textContent = `${new Intl.DateTimeFormat(localeCode(), { weekday: 'long', timeZone: zone }).format(now)} · ${zone}`;
  $('#overviewHeroTimeValue').textContent = new Intl.DateTimeFormat(localeCode(), { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(now);
  $('#overviewHeroSessionValue').textContent = currentSessionLabel();
  $('#overviewHeroTags').innerHTML = [
    `<span class="tag ${dashboard.risk.state === 'SAFE' ? 'safe' : dashboard.risk.state === 'ATTENTION' ? 'warn' : 'bad'}">${escapeHtml(t('overview.hero.risk'))}: ${escapeHtml(riskChip(dashboard.risk.state).label)}</span>`,
    `<span class="tag ${dashboard.discipline.score >= 70 ? 'safe' : dashboard.discipline.score >= 40 ? 'warn' : 'bad'}">${escapeHtml(t('overview.hero.discipline'))}: ${escapeHtml(formatNumber(dashboard.discipline.score, 0))}</span>`,
    `<span class="tag blue">${escapeHtml(t('overview.hero.challenge'))}: ${escapeHtml(formatPercent(dashboard.risk.challenge.progressClamped ?? 0))}</span>`,
    nextNews ? `<span class="tag warn">${escapeHtml(t('overview.hero.nextNews'))}: ${escapeHtml(nextNews.Country || nextNews.country || '')} · ${escapeHtml(formatShortDate(nextNews.Date || nextNews.date || ''))}</span>` : `<span class="tag neutral">${escapeHtml(t('overview.hero.noNews'))}</span>`,
  ].join('');
  $('#overviewHeroInsight').className = `hero-insight ${insightTone}`;
  $('#overviewHeroInsight').innerHTML = `
    <strong>${escapeHtml(t('overview.hero.insightTitle'))}</strong>
    <p>${escapeHtml(insightText)}</p>
    <div class="hero-insight-meta">${escapeHtml(t('overview.hero.pending'))}: ${dashboard.discipline.totals.pending} · ${escapeHtml(t('overview.hero.reviewed'))}: ${dashboard.discipline.totals.decided}</div>
  `;
}

function renderAttentionQueue(account, dashboard) {
  const today = model.daily?.todaySummary;
  const pendingSignals = allLiveSignalsForAccount().filter((signal) => signalDisplayState(signal).key === 'pending').length;
  const items = [];
  if (dashboard.risk.warnings?.length) items.push({ tone: 'bad', title: t('overview.attentionRisk'), hint: t('overview.attentionRiskHint'), page: 'overview' });
  if (dashboard.risk.openPositions?.count) items.push({ tone: 'warn', title: `${t('overview.attentionPositions')} · ${dashboard.risk.openPositions.count}`, hint: t('overview.attentionPositionsHint'), page: 'data' });
  if (pendingSignals) items.push({ tone: 'warn', title: `${t('overview.attentionSignals')} · ${pendingSignals}`, hint: t('overview.attentionSignalsHint'), page: 'signals' });
  if (!today?.reviewedAt) items.push({ tone: 'neutral', title: t('overview.attentionPlan'), hint: t('overview.attentionPlanHint'), page: 'daily' });
  if (!items.length) items.push({ tone: 'safe', title: t('overview.attentionClear'), hint: t('overview.attentionClearHint'), page: '' });

  $('#overviewAttentionList').innerHTML = items.map((item) => `
    <article class="attention-item ${item.tone}">
      <div><strong>${escapeHtml(item.title)}</strong><span>${escapeHtml(item.hint)}</span></div>
      ${item.page ? `<button class="ghost small" data-attention-page="${escapeHtml(item.page)}">${escapeHtml(t('overview.attentionOpen'))}</button>` : ''}
    </article>
  `).join('');
  $$('[data-attention-page]').forEach((button) => {
    button.onclick = () => {
      model.page = button.dataset.attentionPage;
      persistUiState();
      renderActivePage();
      renderWorkspaceStatus();
    };
  });
}

function renderQuickStart() {
  const panel = $('#quickStartPanel');
  const account = activeAccount();

  if (model.quickStartDismissed || !account) {
    panel.classList.add('hidden');
    return;
  }

  const steps = [
    {
      done: Number(account.capital) > 0 && Number(account.dailyLoss) > 0 && Number(account.maxDrawdown) > 0,
      label: t('overview.quickStart.capital'),
      action: t('overview.quickStart.capitalAction'),
      go: 'settings',
    },
    {
      done: !!model.state?.settings?.csvPath,
      label: t('overview.quickStart.csv'),
      action: t('overview.quickStart.csvAction'),
      go: 'csv',
    },
    {
      done: !!model.newsConfigured,
      label: t('overview.quickStart.news'),
      action: t('overview.quickStart.newsAction'),
      go: 'settings',
    },
  ];

  if (steps.every((step) => step.done)) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  $('#quickStartSteps').innerHTML = steps.map((step, index) => `
    <div class="quick-step ${step.done ? 'done' : ''}">
      <span class="quick-step-index">${step.done ? '✓' : index + 1}</span>
      <span class="quick-step-label">${escapeHtml(step.label)}</span>
      ${step.done ? '' : `<button class="ghost small" data-quick-go="${escapeHtml(step.go)}">${escapeHtml(step.action)}</button>`}
    </div>
  `).join('');

  $$('[data-quick-go]').forEach((button) => {
    button.onclick = async () => {
      if (button.dataset.quickGo === 'csv') {
        await chooseCsv();
        return;
      }
      model.page = 'settings';
      persistUiState();
      renderActivePage();
      renderWorkspaceStatus();
    };
  });
}

function renderOverview() {
  const account = activeAccount();
  const dashboard = model.dashboard;
  if (!account || !dashboard) return;

  renderQuickStart();
  renderAttentionQueue(account, dashboard);
  renderOverviewHero(account, dashboard);

  $('#overviewHealthCards').innerHTML = [
    metricCard(t('overview.health.capital'), formatCurrency(dashboard.risk.balances.capital, account.currency), account.name || '', '', 'capital'),
    metricCard(t('overview.health.balance'), formatCurrency(dashboard.risk.balances.balance, account.currency), t('overview.health.balanceHint'), '', 'balance'),
    metricCard(t('overview.health.equity'), formatCurrency(dashboard.risk.balances.equity, account.currency), t('overview.health.equityHint'), dashboard.risk.balances.openPnl >= 0 ? 'good' : 'bad', 'equity'),
    metricCard(t('overview.health.openPnl'), `${dashboard.risk.balances.openPnl >= 0 ? '+' : ''}${formatCurrency(dashboard.risk.balances.openPnl, account.currency)}`, `${dashboard.risk.openPositions.count} ${t('overview.health.positions')}`, dashboard.risk.balances.openPnl >= 0 ? 'good' : 'bad', 'position'),
  ].join('');

  const riskState = riskChip(dashboard.risk.state);
  $('#riskStateChip').className = `chip ${riskState.cls}`;
  $('#riskStateChip').textContent = riskState.label;
  $('#overviewRiskSummary').innerHTML = `
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.todayClosed'))}</span><span class="value ${classForSigned(dashboard.risk.balances.todayClosedPnl)}">${dashboard.risk.balances.todayClosedPnl > 0 ? '+' : ''}${escapeHtml(formatCurrency(dashboard.risk.balances.todayClosedPnl, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.dailyRemaining'))}</span><span class="value ${classForSigned(dashboard.risk.limits.dailyLossRemaining)}">${dashboard.risk.limits.dailyLossRemaining === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.limits.dailyLossRemaining, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.drawdownRemaining'))}</span><span class="value ${classForSigned(dashboard.risk.limits.drawdownRemaining)}">${dashboard.risk.limits.drawdownRemaining === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.limits.drawdownRemaining, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.lossStreak'))}</span><span class="value">${dashboard.risk.streaks.consecutiveLosses}</span></div>
  `;
  $('#overviewWarnings').innerHTML = dashboard.risk.warnings.length
    ? dashboard.risk.warnings.map((warning) => `<span class="chip ${warning.severity === 'critical' ? 'bad' : 'warn'}">${escapeHtml(t(`warnings.${warning.code}`))}</span>`).join('')
    : `<span class="chip safe">${escapeHtml(t('warnings.ALL_CLEAR'))}</span>`;

  $('#disciplineScoreChip').className = `chip ${dashboard.discipline.score >= 70 ? 'safe' : dashboard.discipline.score >= 40 ? 'warn' : 'bad'}`;
  $('#disciplineScoreChip').textContent = `${t('overview.discipline.score')} ${formatNumber(dashboard.discipline.score, 0)}`;
  $('#overviewDisciplineSummary').innerHTML = `
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.coverage'))}</span><span class="value">${escapeHtml(formatPercent(dashboard.discipline.rates.decisionCoverage))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.executed'))}</span><span class="value">${dashboard.discipline.totals.executed}/${dashboard.discipline.totals.signals}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.missed'))}</span><span class="value ${dashboard.discipline.totals.missed ? 'value-bad' : ''}">${dashboard.discipline.totals.missed}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.linkRate'))}</span><span class="value">${escapeHtml(formatPercent(dashboard.discipline.rates.linkRate))}</span></div>
  `;
  $('#overviewReasons').innerHTML = dashboard.discipline.reasons.length
    ? dashboard.discipline.reasons.slice(0, 6).map((item) => `<span class="tag warn">${escapeHtml(item.reason)} · ${item.count}</span>`).join('')
    : `<span class="tag safe">${escapeHtml(t('signals.reasonModal.none'))}</span>`;

  const progress = dashboard.risk.challenge.progressClamped ?? 0;
  $('#challengePercentChip').textContent = dashboard.risk.challenge.progress === null ? t('ui.noValue') : formatPercent(progress);
  $('#challengeProgressBar').style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  $('#overviewChallengeSummary').innerHTML = `
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.challenge.gain'))}</span><span class="value ${classForSigned(dashboard.risk.challenge.challengeGain)}">${dashboard.risk.challenge.challengeGain > 0 ? '+' : ''}${escapeHtml(formatCurrency(dashboard.risk.challenge.challengeGain, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.challenge.target'))}</span><span class="value">${dashboard.risk.challenge.targetAmount === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.challenge.targetAmount, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.challenge.remaining'))}</span><span class="value">${dashboard.risk.challenge.challengeRemaining === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.challenge.challengeRemaining, account.currency))}</span></div>
  `;

  $('#overviewNewsStatus').textContent = model.newsConfigured ? t('overview.news.live') : t('overview.news.notConfigured');
  $('#overviewNewsList').innerHTML = model.news.length
    ? model.news.slice(0, 4).map((item) => `
      <div class="item">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(item.Country || item.country || '')} · ${escapeHtml(item.Event || item.event || '')}</div>
            <div class="item-subtitle">${escapeHtml(formatDateTime(item.Date || item.date))}</div>
          </div>
          <span class="chip blue">HIGH</span>
        </div>
      </div>
    `).join('')
    : guidedEmpty('news', model.newsConfigured ? '' : 'openSettings');

  const liveSignals = allLiveSignalsForAccount();
  $('#overviewSignalsHint').textContent = `${liveSignals.length} ${t('signals.totalSignals')}`;
  $('#overviewSignalList').innerHTML = renderListRows(
    liveSignals.slice(0, 5),
    renderSignalCard,
    { key: 'signals', action: 'chooseCsv' }
  );
}
