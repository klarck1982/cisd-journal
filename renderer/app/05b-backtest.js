/**
 * Backtest workspace: session library, live capture controls, spotlight stats,
 * equity curve, filter-attribution panel, per-signal review actions.
 * Split from 05-pages-trading.js to honor the 450-line module contract.
 */

const BACKTEST_SCORED_STATUSES = new Set(['WIN', 'LOSS', 'BE']);
const BACKTEST_REVIEWED_STATUSES = new Set(['WIN', 'LOSS', 'BE', 'MISSED', 'SKIPPED']);
const BACKTEST_FACTOR_KEYS = ['Trend', 'Fib', 'MS', 'HTF', 'MomVol', 'Confirmed'];
const BACKTEST_PRESET_COMBO = ['Trend', 'Fib', 'MomVol', 'Confirmed'];

function backtestsForAccount() {
  return (model.state?.backtests || [])
    .filter((item) => item.accountId === model.accountId)
    // archiveBacktest persists status='ARCHIVED'; the old !item.archived check
    // never matched anything, so archived sessions kept showing in the library.
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
    .sort((a, b) => String(a.signalAt || '').localeCompare(String(b.signalAt || '')));
}

function backtestFactorSignature(sessionId) {
  const signals = (model.state?.backtestSignals || []).filter((item) => item.backtestId === sessionId);
  const reviewed = signals.filter((item) => BACKTEST_REVIEWED_STATUSES.has(String(item.status || '').toUpperCase()));
  const lastReview = reviewed.reduce((max, item) => (String(item.reviewedAt || '') > max ? String(item.reviewedAt) : max), '');
  return `${signals.length}:${reviewed.length}:${lastReview}`;
}

function backtestFactorsCacheKey(sessionId) {
  return `${sessionId}::${(model.backtestCombo || []).join('+')}`;
}

function ensureBacktestFactors(sessionId) {
  if (!sessionId || typeof cisd === 'undefined' || !cisd.getBacktestFactors) return;
  const cacheKey = backtestFactorsCacheKey(sessionId);
  const signature = backtestFactorSignature(sessionId);
  const cached = model.backtestFactors[cacheKey];
  if (cached && cached.signature === signature) return;
  if (model.backtestFactorsLoading === cacheKey) return;
  model.backtestFactorsLoading = cacheKey;
  cisd
    .getBacktestFactors(sessionId, { factors: model.backtestCombo || [] })
    .then((result) => {
      model.backtestFactors[cacheKey] = { signature, data: result };
    })
    .catch(() => {})
    .finally(() => {
      if (model.backtestFactorsLoading === cacheKey) model.backtestFactorsLoading = '';
      renderBacktest();
    });
}

function isBacktestScored(signal) {
  return BACKTEST_SCORED_STATUSES.has(String(signal?.status || '').toUpperCase())
    && signal?.resultR !== null
    && signal?.resultR !== undefined
    && signal?.resultR !== ''
    && Number.isFinite(Number(signal.resultR));
}

function buildBacktestCurvePoints(signals) {
  let equity = 0;
  return signals
    .filter(isBacktestScored)
    .map((signal) => {
      equity += Number(signal.resultR) || 0;
      return { at: signal.signalAt || signal.importedAt || '', result: Number(signal.resultR) || 0, equity };
    });
}

function formatOptionalPercent(value) {
  return value === null || value === undefined ? '—' : formatPercent(value);
}

function factorStatCell(summary, cls) {
  if (!summary || !summary.scored) return `<span class="tag neutral">—</span>`;
  return `
    <span class="tag ${cls}">${summary.scored}</span>
    <span class="tag neutral">${formatOptionalPercent(summary.winRate)}</span>
    <span class="tag ${summary.netR >= 0 ? 'safe' : 'bad'}">${summary.netR >= 0 ? '+' : ''}${escapeHtml(formatNumber(summary.netR, 2))}R</span>
  `;
}

function renderBacktestFactorPanel(selected) {
  const body = $('#backtestFactorsBody');
  if (!body) return;
  if (!selected) {
    body.innerHTML = emptyState(t('backtest.factors.empty'));
    return;
  }
  ensureBacktestFactors(selected.id);
  const cached = model.backtestFactors[backtestFactorsCacheKey(selected.id)];
  if (!cached) {
    body.innerHTML = `<div class="panel-hint">${escapeHtml(t('ui.loading'))}</div>`;
    return;
  }
  const { factors = [], leaders = [], grades = [], combo = null } = cached.data || {};
  const selectedCombo = model.backtestCombo || [];

  const comboChips = BACKTEST_FACTOR_KEYS.map((key) => {
    const active = selectedCombo.includes(key);
    return `<button class="chip ${active ? 'blue' : 'neutral'} chip-toggle" data-factor-toggle="${escapeHtml(key)}">${escapeHtml(key)}</button>`;
  }).join('');

  const presetActive =
    selectedCombo.length === BACKTEST_PRESET_COMBO.length && BACKTEST_PRESET_COMBO.every((key) => selectedCombo.includes(key));
  const presetChip = `<button class="chip ${presetActive ? 'blue' : 'neutral'} chip-toggle" data-factor-preset="best4">${escapeHtml(t('backtest.factors.presetBest4'))}</button>`;

  const leaderChips = leaders
    .map(
      (leader) => `
      <button class="chip neutral chip-toggle" data-factor-leader="${escapeHtml(leader.factors.join(','))}">
        ${escapeHtml(leader.factors.join(' + '))} · ${escapeHtml(formatNumber(leader.matching.avgR ?? 0, 2))}R ⌀ · ${formatOptionalPercent(leader.matching.winRate)}
      </button>`
    )
    .join('');

  const factorRows = factors
    .map((factor) => {
      const passedActive = factor.passed.scored || factor.passed.signals;
      return `
      <article class="item factor-row">
        <div class="item-head">
          <div class="item-title">${escapeHtml(factor.key)}</div>
        </div>
        <div class="factor-cells">
          <div class="factor-cell">
            <span class="factor-cell-label">${escapeHtml(t('backtest.factors.passed'))}</span>
            <span class="factor-cell-values">${factorStatCell(factor.passed, 'safe')}</span>
          </div>
          <div class="factor-cell">
            <span class="factor-cell-label">${escapeHtml(t('backtest.factors.failed'))}</span>
            <span class="factor-cell-values">${factorStatCell(factor.failed, 'bad')}</span>
          </div>
          <div class="factor-cell">
            <span class="factor-cell-label">${escapeHtml(t('backtest.factors.inactive'))}</span>
            <span class="factor-cell-values">${factorStatCell(factor.inactive, 'neutral')}</span>
          </div>
        </div>
      </article>`;
    })
    .join('');

  const comboResult = combo
    ? `
      <div class="metric-grid compact combo-result">
        ${metricCard(
          t('backtest.factors.matching'),
          `${combo.matching.scored}`,
          `${formatOptionalPercent(combo.matching.winRate)} · ${combo.matching.netR >= 0 ? '+' : ''}${formatNumber(combo.matching.netR, 2)}R · ⌀ ${combo.matching.avgR !== null ? formatNumber(combo.matching.avgR, 2) + 'R' : '—'}`,
          combo.matching.netR >= 0 ? 'good' : 'bad',
          'edge'
        )}
        ${metricCard(
          t('backtest.factors.others'),
          `${combo.others.scored}`,
          `${formatOptionalPercent(combo.others.winRate)} · ${combo.others.netR >= 0 ? '+' : ''}${formatNumber(combo.others.netR, 2)}R · ⌀ ${combo.others.avgR !== null ? formatNumber(combo.others.avgR, 2) + 'R' : '—'}`,
          combo.others.netR >= 0 ? 'good' : 'warn',
          'analytics'
        )}
      </div>`
    : '';

  const gradeTags = grades
    .filter((grade) => grade.scored)
    .map(
      (grade) =>
        `<span class="tag ${grade.netR >= 0 ? 'safe' : 'bad'}">${escapeHtml(grade.grade)}: ${grade.scored} · ${formatOptionalPercent(grade.winRate)} · ${grade.netR >= 0 ? '+' : ''}${escapeHtml(formatNumber(grade.netR, 2))}R</span>`
    )
    .join('');

  body.innerHTML = `
    <div class="tag-cloud" style="margin-bottom:10px;">${comboChips}${presetChip}</div>
    ${comboResult}
    ${gradeTags ? `<div class="tag-cloud" style="margin-bottom:10px;">${gradeTags}</div>` : ''}
    <div class="list">${factorRows}</div>
    ${leaderChips ? `<div class="panel-hint" style="margin:12px 0 6px;">${escapeHtml(t('backtest.factors.leadersHint'))}</div><div class="tag-cloud">${leaderChips}</div>` : ''}
  `;

  $$('[data-factor-toggle]').forEach((button) => {
    button.onclick = () => {
      const key = button.dataset.factorToggle;
      const current = new Set(model.backtestCombo || []);
      if (current.has(key)) current.delete(key);
      else current.add(key);
      model.backtestCombo = [...current];
      renderBacktest();
    };
  });
  $$('[data-factor-preset]').forEach((button) => {
    button.onclick = () => {
      model.backtestCombo = presetActive ? [] : [...BACKTEST_PRESET_COMBO];
      renderBacktest();
    };
  });
  $$('[data-factor-leader]').forEach((button) => {
    button.onclick = () => {
      model.backtestCombo = String(button.dataset.factorLeader || '').split(',').filter(Boolean);
      renderBacktest();
    };
  });
}

function renderBacktestSpotlight(selected, reviewSignals) {
  $('#backtestSpotlightTitle').textContent = t('backtest.spotlight.title');
  $('#backtestSpotlightHint').textContent = selected ? (selected.name || t('backtest.create.defaultName')) : t('backtest.spotlight.emptyHint');
  if (!selected) {
    $('#backtestSpotlightCards').innerHTML = emptyState(t('backtest.spotlight.empty'));
    $('#backtestSpotlightTags').innerHTML = '';
    const curveEmpty = $('#backtestCurve');
    if (curveEmpty) curveEmpty.innerHTML = '';
    return;
  }
  const reviewed = reviewSignals.filter((signal) => BACKTEST_REVIEWED_STATUSES.has(String(signal.status || '').toUpperCase()));
  const scored = reviewSignals.filter(isBacktestScored);
  const wins = scored.filter((signal) => String(signal.status).toUpperCase() === 'WIN').length;
  const net = scored.reduce((sum, signal) => sum + (Number(signal.resultR) || 0), 0);
  const avg = scored.length ? net / scored.length : 0;

  const capturing = selected.status === 'ACTIVE' && selected.captureEnabled !== false;

  $('#backtestSpotlightCards').innerHTML = [
    metricCard(t('backtest.spotlight.matched'), String(reviewSignals.length), t('backtest.spotlight.matchedHint'), '', 'signals'),
    metricCard(t('backtest.spotlight.reviewed'), `${reviewed.length}/${reviewSignals.length || 0}`, t('backtest.spotlight.reviewedHint'), reviewed.length === reviewSignals.length && reviewSignals.length ? 'good' : 'warn', 'backtest'),
    metricCard(t('backtest.spotlight.winRate'), scored.length ? formatPercent(wins / scored.length) : '—', t('backtest.spotlight.winRateHint'), wins / Math.max(scored.length, 1) >= 0.5 ? 'good' : 'warn', 'analytics'),
    metricCard(t('backtest.spotlight.net'), `${net > 0 ? '+' : ''}${formatNumber(net, 2)}R`, `${t('backtest.spotlight.avg')} ${avg > 0 ? '+' : ''}${formatNumber(avg, 2)}R`, net >= 0 ? 'good' : 'bad', 'curve'),
  ].join('');

  $('#backtestSpotlightTags').innerHTML = [
    capturing ? `<span class="tag safe pulse-dot">${escapeHtml(t('backtest.library.captureLive'))}</span>` : '',
    selected.filters?.start ? `<span class="tag neutral">${escapeHtml(selected.filters.start)} → ${escapeHtml(selected.filters.end || '')}</span>` : '',
    selected.filters?.session ? `<span class="tag blue">${escapeHtml(selected.filters.session)}</span>` : '',
    selected.filters?.symbol ? `<span class="tag blue">${escapeHtml(selected.filters.symbol)}</span>` : '',
    selected.filters?.tf ? `<span class="tag blue">${escapeHtml(selected.filters.tf)}</span>` : '',
  ].filter(Boolean).join('');

  const curveHost = $('#backtestCurve');
  if (curveHost) {
    const points = buildBacktestCurvePoints(reviewSignals);
    curveHost.innerHTML = points.length
      ? `<div class="curve-title">${escapeHtml(t('backtest.curve.title'))}</div>${buildCurveSvg(points)}`
      : `<div class="panel-hint">${escapeHtml(t('backtest.curve.empty'))}</div>`;
    // Reuse the shared hover inspector so every R point exposes its signal
    // time, individual result and running equity instead of being decorative.
    if (points.length) bindCurveTooltip('#backtestCurve', 'R');
  }
}

function renderBacktest() {
  const sessions = backtestsForAccount();
  const selected = selectedBacktest();
  $('#backtestSearch').value = model.search.backtest;
  if (selected) model.selectedBacktestId = selected.id;
  else model.selectedBacktestId = null;

  $('#backtestLibrary').innerHTML = renderListRows(sessions, (session) => {
    const signals = (model.state?.backtestSignals || []).filter((item) => item.backtestId === session.id);
    const reviewed = signals.filter((item) => BACKTEST_REVIEWED_STATUSES.has(String(item.status || '').toUpperCase())).length;
    const isActive = session.id === selected?.id;
    const capturing = session.status === 'ACTIVE' && session.captureEnabled !== false;
    return `
      <article class="item ${isActive ? 'account-card active' : ''}">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(session.name || t('backtest.create.defaultName'))}</div>
            <div class="item-subtitle">${escapeHtml(session.filters?.start || '')} → ${escapeHtml(session.filters?.end || '')}</div>
          </div>
          <div class="playbook-actions">
            <span class="chip ${session.status === 'FINISHED' ? 'neutral' : 'safe'}">${escapeHtml(session.status === 'FINISHED' ? t('backtest.status.finished') : t('backtest.status.active'))}</span>
            ${capturing ? `<span class="chip red-dot" title="${escapeHtml(t('backtest.library.captureLive'))}">●</span>` : ''}
            <span class="chip blue">${signals.length}</span>
          </div>
        </div>
        <div class="item-meta">
          ${session.filters?.session ? `<span class="tag neutral">${escapeHtml(session.filters.session)}</span>` : ''}
          ${session.filters?.symbol ? `<span class="tag neutral">${escapeHtml(session.filters.symbol)}</span>` : ''}
          ${session.filters?.tf ? `<span class="tag neutral">${escapeHtml(session.filters.tf)}</span>` : ''}
          <span class="tag neutral">${reviewed}/${signals.length} ${escapeHtml(t('backtest.library.reviewed'))}</span>
        </div>
        <div class="item-actions">
          <button class="ghost" data-backtest-open="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.open'))}</button>
          <button class="ghost" data-backtest-edit="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.edit'))}</button>
          ${session.status === 'ACTIVE' ? `<button class="ghost ${capturing ? 'active' : ''}" data-backtest-capture="${escapeHtml(session.id)}" data-enabled="${capturing ? '0' : '1'}" title="${escapeHtml(t('backtest.library.captureHint'))}">${escapeHtml(capturing ? t('backtest.library.captureStop') : t('backtest.library.captureStart'))}</button>` : ''}
          <button class="ghost" data-backtest-refresh="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.refresh'))}</button>
          ${session.status === 'ACTIVE' ? `<button class="ghost" data-backtest-stop="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.stop'))}</button>` : ''}
          <button class="ghost" data-backtest-archive="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.archive'))}</button>
          <button class="ghost danger" data-backtest-reset="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.delete'))}</button>
        </div>
      </article>
    `;
  }, 'backtests');

  const reviewQuery = model.search.backtest.trim().toLowerCase();
  const reviewSignals = backtestSignalsForSelected().filter((signal) => !reviewQuery || `${signal.SignalID || ''} ${signal.Instrument || ''} ${signal.Direction || ''} ${signal.Session || ''} ${signal.TF || ''} ${signal.reviewNote || ''}`.toLowerCase().includes(reviewQuery));
  const selectedSignals = backtestSignalsForSelected();
  renderBacktestSpotlight(selected, selectedSignals);
  renderBacktestFactorPanel(selected);

  const statusLabel = (status) => {
    const key = String(status || 'NEW').toUpperCase();
    if (key === 'NEW') return t('signals.status.pending');
    if (key === 'WIN') return t('backtest.review.statuses.win');
    if (key === 'LOSS') return t('backtest.review.statuses.loss');
    if (key === 'BE') return t('backtest.review.statuses.be');
    if (key === 'SKIPPED') return t('backtest.review.statuses.skipped');
    if (key === 'MISSED') return t('backtest.review.statuses.missed');
    return key;
  };

  $('#backtestReviewList').innerHTML = renderListRows(reviewSignals, (signal) => {
    const status = String(signal.status || 'NEW').toUpperCase();
    const reviewed = BACKTEST_REVIEWED_STATUSES.has(status);
    const rowCls = status === 'MISSED' ? 'missed' : status === 'SKIPPED' ? 'missed' : reviewed ? 'executed' : 'pending';
    return `
      <article class="item signal-card ${rowCls}">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</div>
            <div class="item-subtitle">${escapeHtml(signal.TF || '')} · ${escapeHtml(signal.Session || '')} · ${escapeHtml(formatDateTime(signal.signalAt || signal.importedAt || ''))}${signal.Day ? ` · ${escapeHtml(signal.Day)}` : ''}</div>
          </div>
          <span class="chip ${status === 'NEW' ? 'warn' : status === 'MISSED' || status === 'SKIPPED' ? 'bad' : 'safe'}">${escapeHtml(statusLabel(status))}</span>
        </div>
        <div class="item-meta">
          ${signal.Score && signal.Score !== '-' ? `<span class="tag blue">Score ${escapeHtml(signal.Score)}</span>` : ''}
          ${['Trend', 'Fib', 'MomVol', 'Confirmed'].filter((key) => signal[key] === '1').map((key) => `<span class="tag safe">${escapeHtml(key)}</span>`).join('')}
          ${signal.reviewNote ? `<span class="tag warn">${escapeHtml(signal.reviewNote)}</span>` : ''}
          ${signal.resultR !== null && signal.resultR !== undefined ? `<span class="tag blue">${signal.resultR > 0 ? '+' : ''}${escapeHtml(formatNumber(signal.resultR, 2))}R</span>` : ''}
        </div>
        <div class="item-actions">
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="WIN" data-result="1">${escapeHtml(t('backtest.review.statuses.win'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="LOSS" data-result="-1">${escapeHtml(t('backtest.review.statuses.loss'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="BE" data-result="0">${escapeHtml(t('backtest.review.statuses.be'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="SKIPPED">${escapeHtml(t('backtest.review.statuses.skipped'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="MISSED">${escapeHtml(t('backtest.review.statuses.missed'))}</button>
          <button class="ghost" data-backtest-journal="${escapeHtml(signal.id)}" title="${escapeHtml(t('backtest.review.journalHint'))}">${escapeHtml(t('backtest.review.journal'))}</button>
        </div>
      </article>
    `;
  }, 'backtestSignals');

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
  $$('[data-backtest-edit]').forEach((button) => {
    button.onclick = () => openBacktestFormModal(button.dataset.backtestEdit);
  });
  $$('[data-backtest-capture]').forEach((button) => {
    button.onclick = async () => {
      const enable = button.dataset.enabled === '1';
      await runBusy(t('ui.loading'), () => cisd.setBacktestCapture(button.dataset.backtestCapture, enable));
      await refreshStateAndRender();
      toast(enable ? t('backtest.library.captureStarted') : t('backtest.library.captureStopped'), 'success');
    };
  });
  $$('[data-backtest-reset]').forEach((button) => {
    button.onclick = async () => {
      const ok = await openConfirm({
        title: t('backtest.library.delete'),
        text: t('backtest.library.deleteConfirm'),
        confirmLabel: t('backtest.library.delete'),
      });
      if (!ok) return;
      await runBusy(t('ui.loading'), () => cisd.resetBacktest(button.dataset.backtestReset));
      if (model.selectedBacktestId === button.dataset.backtestReset) model.selectedBacktestId = null;
      persistUiState();
      await refreshStateAndRender();
      toast(t('messages.backtestReset'), 'success');
    };
  });

  // Finish and archive: both handlers existed in main.js and preload.js but had
  // no control anywhere, so sessions accumulated with no way to close them and
  // no visible status to tell one from another.
  $$('[data-backtest-stop]').forEach((button) => {
    button.onclick = async () => {
      const ok = await openConfirm({
        title: t('backtest.library.stop'),
        text: t('backtest.library.stopConfirm'),
        confirmLabel: t('backtest.library.stop'),
      });
      if (!ok) return;
      await runBusy(t('ui.loading'), () => cisd.stopBacktest(button.dataset.backtestStop));
      await refreshStateAndRender();
      toast(t('backtest.library.stopped'), 'success');
    };
  });

  $$('[data-backtest-archive]').forEach((button) => {
    button.onclick = async () => {
      const ok = await openConfirm({
        title: t('backtest.library.archive'),
        text: t('backtest.library.archiveConfirm'),
        confirmLabel: t('backtest.library.archive'),
      });
      if (!ok) return;
      await runBusy(t('ui.loading'), () => cisd.archiveBacktest(button.dataset.backtestArchive));
      if (model.selectedBacktestId === button.dataset.backtestArchive) model.selectedBacktestId = null;
      persistUiState();
      await refreshStateAndRender();
      toast(t('backtest.library.archived'), 'success');
    };
  });
  $$('[data-backtest-review]').forEach((button) => {
    button.onclick = () => {
      openBacktestReviewModal(button.dataset.backtestReview, button.dataset.status, button.dataset.result || '');
    };
  });
  $$('[data-backtest-journal]').forEach((button) => {
    button.onclick = () => {
      const signal = backtestSignalById(button.dataset.backtestJournal);
      if (!signal) return;
      // Reuse the journal prefill bridge so a graded replay idea can be logged
      // as a manual trade without retyping instrument/direction/signal id.
      const journalSignal = { ...signal, SignalID: signal.SignalID || signal.baseSignalId };
      openJournalForSignal(journalSignal, 'link');
    };
  });
}

