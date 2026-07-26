/**
 * Event wiring and application start-up. Loaded last.
 */

function bindEvents() {
  $('#minimizeBtn').onclick = () => cisd.minimize();
  $('#maximizeBtn').onclick = () => cisd.maximize();
  $('#closeBtn').onclick = () => cisd.close();
  $('#newAccountBtn').onclick = openAccountModal;
  $('#accountModalForm').addEventListener('submit', createAccount);
  $('#cancelAccountModal').onclick = closeAccountModal;
  $('#closeAccountModal').onclick = closeAccountModal;
  $('#accountModal').addEventListener('click', (event) => {
    if (event.target.id === 'accountModal') closeAccountModal();
  });

  $('#quickStartDismiss').onclick = () => {
    model.quickStartDismissed = true;
    persistUiState();
    renderQuickStart();
  };

  $('#saveMorningBtn').onclick = saveMorning;
  $('#saveEveningBtn').onclick = saveEvening;

  $('#newPlaybookBtn').onclick = openPlaybookModal;
  $('#playbookForm').addEventListener('submit', savePlaybook);
  $('#cancelPlaybookModal').onclick = closePlaybookModal;
  $('#closePlaybookModal').onclick = closePlaybookModal;
  $('#playbookModal').addEventListener('click', (event) => {
    if (event.target.id === 'playbookModal') closePlaybookModal();
  });
  $('#tradePlaybook').addEventListener('change', renderTradeRulesChecklist);

  $('#exportTradesBtn').onclick = exportTrades;
  $('#resetAccountBtn').onclick = resetCurrentAccount;
  $('#tradeChartBeforeBtn').onclick = () => attachTradeChart('before');
  $('#tradeChartAfterBtn').onclick = () => attachTradeChart('after');
  $('#tradeChartBeforeClear').onclick = () => clearTradeChart('before');
  $('#tradeChartAfterClear').onclick = () => clearTradeChart('after');

  $$('.nav-link').forEach((button) => {
    button.onclick = () => {
      model.page = button.dataset.page;
      persistUiState();
      renderActivePage();
      renderWorkspaceStatus();
    };
  });

  $('#overviewOpenTerminal').onclick = openTerminal;
  $('#overviewLoadNews').onclick = () => loadNews(false);
  $('#overviewGoSignals').onclick = () => {
    model.page = 'signals';
    persistUiState();
    renderActivePage();
    renderWorkspaceStatus();
  };

  $('#chooseCsvBtn').onclick = chooseCsv;
  $('#refreshSnapshotsBtn').onclick = async () => {
    await refreshStateAndRender();
    toast(t('messages.refreshed'), 'success');
  };

  $('#tradeForm').addEventListener('submit', saveTrade);
  $('#backtestForm').addEventListener('submit', startBacktest);
  $('#accountSettingsForm').addEventListener('submit', saveAccountSettings);
  $('#journalGuidanceBackBtn').onclick = () => {
    model.page = 'signals';
    persistUiState();
    renderActivePage();
    renderWorkspaceStatus();
  };
  $('#journalGuidanceClearBtn').onclick = () => {
    clearJournalGuidance();
    $('#tradeForm')?.reset();
    $('#tradeDate').value = todayKey();
    renderJournal();
  };
  $('#fundingAccessModeInput').addEventListener('change', toggleFundingAccessFields);
  $('#saveFundingAccessBtn').onclick = saveFundingAccess;
  $('#syncFundingAccessBtn').onclick = syncFundingAccessNow;
  $('#openFundingAccessBtn').onclick = openFundingAccess;
  $('#signalsSearch').addEventListener('input', () => { model.search.signals = $('#signalsSearch').value; persistUiState(); renderSignalsPage(); });
  $('#journalSearch').addEventListener('input', () => { model.search.journal = $('#journalSearch').value; persistUiState(); renderJournal(); });
  $('#backtestSearch').addEventListener('input', () => { model.search.backtest = $('#backtestSearch').value; persistUiState(); renderBacktest(); });
  $('#tradeSignal').addEventListener('change', () => {
    const signalId = $('#tradeSignal').value;
    const signal = (model.state?.signals || []).find((item) => item.SignalID === signalId);
    if (signal) hydrateTradeForm(signal);
  });

  $('#importMt5Btn').onclick = importMt5;
  $('#importFundedNextBtn').onclick = importFundedNext;
  $('#watchFundedNextBtn').onclick = watchFundedNext;

  $('#savePreferencesBtn').onclick = savePreferences;
  $('#chooseTerminalBtn').onclick = chooseTerminal;
  $('#openTerminalBtn').onclick = openTerminal;
  $('#saveNewsSettingsBtn').onclick = saveNewsSettings;
  $('#testNewsBtn').onclick = () => loadNews(false);
  $('#backupBtn').onclick = backupData;
  $('#restoreBtn').onclick = restoreData;
  $('#openGuideBtn').onclick = openGuide;
  $('#restartOnboardingBtn').onclick = restartOnboarding;

  $('#closeReasonModal').onclick = closeReasonModal;
  $('#saveReasonBtn').onclick = saveReason;
  $('#reasonModal').addEventListener('click', (event) => {
    if (event.target.id === 'reasonModal') closeReasonModal();
  });
  $('#closeBacktestReviewModal').onclick = closeBacktestReviewModal;
  $('#saveBacktestReviewBtn').onclick = saveBacktestReviewFromModal;
  $('#backtestReviewModal').addEventListener('click', (event) => {
    if (event.target.id === 'backtestReviewModal') closeBacktestReviewModal();
  });

  ['#filterPeriod', '#filterSource', '#filterInstrument', '#filterSide', '#filterSession'].forEach((selector) => {
    $(selector).addEventListener('change', updateFilters);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#accountModal').classList.contains('hidden')) closeAccountModal();
    if (!$('#playbookModal').classList.contains('hidden')) closePlaybookModal();
    if (model.reasonSignalId) closeReasonModal();
    if (model.backtestReviewSignalId) closeBacktestReviewModal();
  });
}

async function init() {
  restoreUiState();
  model.bundle = await cisd.localeBundle();
  fillPeriodOptions();
  bindEvents();
  await refreshStateAndRender();
  if (model.newsConfigured) await loadNews(true);
  render();
  setInterval(() => {
    if (!model.state) return;
    renderWorkspaceStatus();
    const account = activeAccount();
    if (account && model.dashboard) renderOverviewHero(account, model.dashboard);
  }, 60000);

  cisd.onChange(async (state) => {
    const previousSignalCount = model.state?.signals?.length || 0;
    model.state = state;
    ensureAccount();
    model.newsConfigured = (await cisd.newsStatus()).configured;
    await refreshSnapshots();
    render();
    if ((state.signals?.length || 0) > previousSignalCount) toast(t('messages.newSignalArrived'), 'info');
  });
}

init().catch((error) => {
  console.error(error);
  toast(`${t('ui.error')}: ${error.message}`, 'error');
});
