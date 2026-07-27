/**
 * Top-level render pipeline and the snapshot refresh cycle.
 */

function render() {
  applyStaticText();
  fillPeriodOptions();
  applyDensity();
  renderWorkspaceStatus();
  renderAccounts();
  renderOverview();
  renderSignalsPage();
  renderJournal();
  renderBacktest();
  renderDaily();
  renderPlaybooks();
  renderEdge();
  renderAnalytics();
  renderCalendar();
  renderData();
  renderSettings();
  renderReasonModal();
  renderBacktestReviewModal();
  renderRiskBanner();
  renderArchivedAccounts();
  renderWelcome();
  renderActivePage();
  bindEmptyStateActions();
}

function applyDensity() {
  const density = model.state?.settings?.dashboardDensity || model.dashboardDensity || 'comfortable';
  document.body.classList.toggle('density-compact', density === 'compact');
  const btn = document.getElementById('toggleDensityBtn');
  if (btn) {
    btn.textContent = density === 'compact' ? '☰ مريح' : '☰ مكثف';
  }
}

async function refreshRuntimeReadiness() {
  model.runtimeReadiness = await cisd.runtimeReadiness();
}

async function refreshFundingAccess() {
  const account = ensureAccount();
  if (!account) {
    model.fundingAccess = null;
    return;
  }
  model.fundingAccess = await cisd.getFundingAccess(model.accountId);
}

async function refreshSnapshots() {
  const account = ensureAccount();
  if (!account) return;
  model.dashboard = await cisd.dashboardSnapshot(model.accountId, { risk: { today: todayKey() } });
  model.analytics = await cisd.analyticsSnapshot(model.accountId, model.filters);
  model.edge = await cisd.edgeSnapshot(model.accountId, { risk: { today: todayKey() } });
  model.playbooks = await cisd.playbooksOverview(model.accountId);
  model.daily = await cisd.dailySnapshot(model.accountId, { today: todayKey() });
  model.calendar = await cisd.calendarMonth(model.accountId, model.calendarMonth ? { month: model.calendarMonth } : {});
}

async function refreshStateAndRender() {
  model.state = await cisd.state();
  ensureAccount();
  model.newsConfigured = (await cisd.newsStatus()).configured;
  await refreshRuntimeReadiness();
  await refreshFundingAccess();
  await refreshSnapshots();
  persistUiState();
  render();
  pulseElement('.status-dock');
}

async function loadNews(silent = false) {
  try {
    const status = await cisd.newsStatus();
    model.newsConfigured = status.configured;
    if (!status.configured) {
      model.news = [];
      render();
      if (!silent) toast(t('settings.newsDisconnected'), 'warn');
      return;
    }
    model.news = await runBusy(t('ui.loading'), () => cisd.fetchNews());
    render();
    if (!silent) toast(t('messages.newsLoaded'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

function openReasonModal(signalId) {
  model.reasonSignalId = signalId;
  model.reasonPreset = 'hesitation';
  $('#reasonNote').value = '';
  renderReasonModal();
}

function closeReasonModal() {
  model.reasonSignalId = null;
  $('#reasonNote').value = '';
  renderReasonModal();
}

async function saveReason() {
  const reasonText = $('#reasonNote').value.trim();
  const preset = t(`signals.reasonModal.presets.${model.reasonPreset}`);
  const combined = reasonText ? `${preset} — ${reasonText}` : preset;
  model.state = await runBusy(t('ui.loading'), () => cisd.signalStatus(model.reasonSignalId, model.accountId, 'MISSED', combined));
  await refreshSnapshots();
  closeReasonModal();
  render();
  toast(t('messages.signalMissedSaved'), 'success');
}
