/**
 * Event wiring and application start-up. Loaded last.
 */

// Handlers offered by guided empty states. Registered here so 01-core can stay
// free of page-specific logic while still rendering an actionable button.
Object.assign(EMPTY_STATE_ACTIONS, {
  chooseCsv: () => chooseCsv(),
  importReport: () => importFundedNext(),
  newPlaybook: () => openPlaybookModal(),
  newAccount: () => openAccountModal(),
  openSettings: () => {
    model.page = 'settings';
    persistUiState();
    renderActivePage();
    renderWorkspaceStatus();
  },
  clearSignalSearch: () => {
    model.search.signals = '';
    $('#signalsSearch').value = '';
    persistUiState();
    renderSignalsPage();
    bindEmptyStateActions();
  },
  clearJournalSearch: () => {
    model.search.journal = '';
    $('#journalSearch').value = '';
    persistUiState();
    renderJournal();
    bindEmptyStateActions();
  },
});

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

  $('#calendarMonthSelect').addEventListener('change', changeCalendarMonth);
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
  $('#backtestManualTradeForm').addEventListener('submit', saveManualBacktestTrade);
  const chooseBacktestCsvBtn = $('#chooseBacktestCsvBtn');
  if (chooseBacktestCsvBtn) chooseBacktestCsvBtn.onclick = chooseBacktestCsv;
  const clearBacktestCsvBtn = $('#clearBacktestCsvBtn');
  if (clearBacktestCsvBtn) clearBacktestCsvBtn.onclick = clearBacktestCsv;
  const toggleDensityBtn = $('#toggleDensityBtn');
  if (toggleDensityBtn) toggleDensityBtn.onclick = toggleDensity;
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
  $('#newsProvider').addEventListener('change', toggleNewsFields);
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

  // --- Trade edit / delete ---------------------------------------------------
  $('#tradeEditForm').addEventListener('submit', saveTradeEdit);
  $('#closeTradeEditModal').onclick = closeTradeEditModal;
  $('#cancelTradeEditBtn').onclick = closeTradeEditModal;
  $('#deleteTradeBtn').onclick = () => deleteTrade(model.editingTradeId);
  $('#tradeEditModal').addEventListener('click', (event) => {
    if (event.target.id === 'tradeEditModal') closeTradeEditModal();
  });

  // --- Account lifecycle -----------------------------------------------------
  $('#archiveAccountBtn').onclick = archiveCurrentAccount;
  $('#deleteAccountBtn').onclick = deleteCurrentAccount;

  // --- Welcome / first run ---------------------------------------------------
  $('#welcomeNext').onclick = welcomeNext;
  $('#welcomeBack').onclick = welcomeBack;
  $('#welcomeSkip').onclick = finishWelcome;
  $('#welcomeChooseCsv').onclick = chooseWelcomeCsv;
  $$('[data-welcome-locale]').forEach((button) => {
    button.onclick = () => chooseWelcomeLocale(button.dataset.welcomeLocale);
  });

  const resetOrderBtn = $('#resetDashboardOrderBtn');
  if (resetOrderBtn) resetOrderBtn.onclick = () => {
    if (window.resetDashboardOrder) window.resetDashboardOrder();
  };

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#accountModal').classList.contains('hidden')) closeAccountModal();
    if (!$('#playbookModal').classList.contains('hidden')) closePlaybookModal();
    if (!$('#tradeEditModal').classList.contains('hidden')) closeTradeEditModal();
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
  if (window.initDashboardOrder) window.initDashboardOrder();
  // Live monitoring.
  //
  // This tick used to only re-render from the cached snapshot, so it redrew the
  // same numbers every minute and nothing ever refetched: a position moving
  // against the trader was invisible until they clicked something. Refetching
  // here is also what lets main.js raise a desktop notification when the risk
  // engine reports NEAR_DAILY_LOSS_LIMIT or a breach.
  setInterval(async () => {
    if (!model.state || model.busy) return;
    try {
      await refreshSnapshots();
      renderWorkspaceStatus();
      const account = activeAccount();
      if (account && model.dashboard) renderOverviewHero(account, model.dashboard);
      renderRiskBanner();
    } catch (error) {
      // A failed background refresh must never surface as a toast storm.
      console.error('background refresh failed', error);
    }
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

  if (cisd.onNewsUpdated) {
    cisd.onNewsUpdated((news) => {
      model.news = news || [];
      render();
    });
  }
}

init().catch((error) => {
  console.error(error);
  toast(`${t('ui.error')}: ${error.message}`, 'error');
});
