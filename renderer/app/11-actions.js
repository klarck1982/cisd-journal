/**
 * User actions: everything that writes through IPC and then re-renders.
 */

async function saveAccountSettings(event) {
  event?.preventDefault();
  const account = activeAccount();
  if (!account) return;
  model.state = await runBusy(t('ui.loading'), () => cisd.saveAccount({
    id: account.id,
    firm: $('#accountFirmInput').value.trim(),
    name: $('#accountNameInput').value.trim(),
    capital: Number($('#accountCapitalInput').value || 0),
    currentBalance: Number($('#accountBalanceInput').value || 0),
    currency: $('#accountCurrencyInput').value,
    phase: $('#accountPhaseInput').value,
    profitTarget: Number($('#accountTargetInput').value || 0),
    dailyLoss: Number($('#accountDailyLossInput').value || 0),
    maxDrawdown: Number($('#accountMaxDrawdownInput').value || 0),
  }));
  await refreshFundingAccess();
  await refreshSnapshots();
  persistUiState();
  render();
  toast(t('messages.accountSettingsSaved'), 'success');
}

async function saveFundingAccess() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.saveFundingAccess(model.accountId, {
      mode: $('#fundingAccessModeInput').value,
      syncScope: $('#fundingSyncScopeInput').value,
      investorLogin: $('#investorLoginInput').value.trim(),
      investorServer: $('#investorServerInput').value.trim(),
      investorPassword: $('#investorPasswordInput').value,
      sharedDashboardUrl: $('#sharedUrlInput').value.trim(),
    }));
    model.state = result.state;
    model.fundingAccess = result.fundingAccess;
    $('#investorPasswordInput').value = '';
    await refreshSnapshots();
    persistUiState();
    render();
    toast(t('messages.fundingAccessSaved'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function openFundingAccess() {
  try {
    const access = model.fundingAccess;
    if (access?.mode === 'shared_url' && access.sharedDashboardUrl) {
      const result = await cisd.openFunding(model.accountId);
      if (result) toast(result, 'info');
      return;
    }
    toast(t('funding.openNotAvailable'), 'warn');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function syncFundingAccessNow() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.syncFundingAccess(model.accountId));
    model.state = result.state;
    model.fundingAccess = result.fundingAccess || model.fundingAccess;
    await refreshSnapshots();
    persistUiState();
    render();
    const mode = model.fundingAccess?.mode;
    const key = mode === 'shared_url' ? 'messages.fundingSyncSharedSuccess' : mode === 'investor_pass' ? 'messages.fundingSyncInvestorSuccess' : 'messages.fundingSyncSuccess';
    toast(t(key), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function savePreferences() {
  const previousLocale = model.state?.settings?.locale || 'ar';
  const locale = $('#settingsLanguage').value;
  await runBusy(t('ui.loading'), () => cisd.updateSettings({
    locale,
    timezone: $('#settingsTimezone').value,
    notifications: $('#settingsNotifications').checked,
  }));
  if (previousLocale !== locale) {
    location.reload();
    return;
  }
  await refreshStateAndRender();
  toast(t('messages.preferencesSaved'), 'success');
}

async function saveNewsSettings() {
  try {
    await runBusy(t('ui.loading'), async () => {
      await cisd.saveNewsProvider($('#newsProvider').value);
      const key = $('#newsKey').value.trim();
      if (key) await cisd.saveNewsKey(key);
    });
    $('#newsKey').value = '';
    await refreshStateAndRender();
    await loadNews(true);
    toast(t('messages.newsSettingsSaved'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function saveTrade(event) {
  event.preventDefault();
  const account = activeAccount();
  if (!account) return;

  const signalId = $('#tradeSignal').value;
  const trade = {
    accountId: account.id,
    source: $('#tradeSource').value,
    symbol: $('#tradeSymbol').value.trim().toUpperCase(),
    side: $('#tradeSide').value,
    resultR: Number($('#tradeResult').value || 0),
    date: $('#tradeDate').value || todayKey(),
    signalId: signalId || '',
    playbookId: $('#tradePlaybook').value || '',
    followedRules: $('#tradePlaybook').value
      ? $$('#tradeRulesChecklist input:checked').map((input) => input.value)
      : undefined,
    tags: $('#tradeTags').value.trim(),
    note: $('#tradeNote').value.trim(),
    beforeImage: model.tradeCharts.beforeImage,
    afterImage: model.tradeCharts.afterImage,
  };

  if (!trade.symbol) {
    toast(t('journal.form.symbolRequired'), 'warn');
    return;
  }

  model.state = await runBusy(t('ui.loading'), async () => {
    const updated = await cisd.addTrade(trade);
    if (signalId) return cisd.signalStatus(signalId, account.id, 'ORDER_PLACED', '');
    return updated;
  });
  await refreshSnapshots();
  $('#tradeForm').reset();
  $('#tradeDate').value = todayKey();
  model.tradeCharts = { beforeImage: '', afterImage: '' };
  renderChartSlots();
  renderTradePlaybookPicker();
  clearJournalGuidance();
  render();
  toast(t('messages.tradeSaved'), 'success');
}

async function startBacktest(event) {
  event.preventDefault();
  const payload = {
    accountId: model.accountId,
    name: $('#backtestName').value.trim() || t('backtest.create.defaultName'),
    start: $('#backtestStart').value,
    end: $('#backtestEnd').value,
    session: $('#backtestSession').value,
    symbol: $('#backtestSymbol').value.trim().toUpperCase(),
    tf: $('#backtestTf').value.trim(),
  };
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.startBacktest(payload));
    model.selectedBacktestId = result.state?.activeBacktestId || result.state?.backtests?.[0]?.id || null;
    persistUiState();
    await refreshStateAndRender();
    $('#backtestForm').reset();
    toast(`${t('messages.backtestImported')} ${result.count}`, 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

function openAccountModal() {
  $('#accountModalFirm').value = 'FundingPips';
  $('#accountModalName').value = '';
  $('#accountModalCapital').value = '100000';
  $('#accountModalCurrency').value = 'USD';
  $('#accountModalPhase').value = 'Challenge';
  $('#accountModalTarget').value = '10';
  $('#accountModalDailyLoss').value = '5';
  $('#accountModalDrawdown').value = '10';
  $('#accountModal').classList.remove('hidden');
  $('#accountModalFirm').focus();
}

function closeAccountModal() {
  $('#accountModal').classList.add('hidden');
}

async function createAccount(event) {
  event?.preventDefault();
  const firm = $('#accountModalFirm').value.trim();
  const name = $('#accountModalName').value.trim();

  if (!firm) {
    toast(t('accountModal.firmRequired'), 'warn');
    $('#accountModalFirm').focus();
    return;
  }
  if (!name) {
    toast(t('accountModal.nameRequired'), 'warn');
    $('#accountModalName').focus();
    return;
  }

  const capital = Number($('#accountModalCapital').value || 0);
  const nextState = await runBusy(t('ui.loading'), () => cisd.saveAccount({
    firm,
    name,
    capital,
    currentBalance: capital,
    currency: $('#accountModalCurrency').value,
    phase: $('#accountModalPhase').value,
    profitTarget: Number($('#accountModalTarget').value || 0),
    dailyLoss: Number($('#accountModalDailyLoss').value || 0),
    maxDrawdown: Number($('#accountModalDrawdown').value || 0),
  }));

  model.state = nextState;
  model.accountId = visibleAccounts().slice(-1)[0]?.id || model.accountId;
  closeAccountModal();
  persistUiState();
  await refreshFundingAccess();
  await refreshSnapshots();
  render();
  toast(t('accountModal.created'), 'success');
}

async function chooseTerminal() {
  const result = await runBusy(t('ui.loading'), () => cisd.chooseTerminal(model.accountId));
  if (!result.cancelled) {
    await refreshStateAndRender();
    toast(t('messages.terminalSaved'), 'success');
  }
}

async function openTerminal() {
  try {
    const result = await cisd.openTerminal(model.accountId);
    if (result) toast(result, 'info');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function chooseCsv() {
  await runBusy(t('ui.loading'), () => cisd.chooseCSV());
  await refreshStateAndRender();
  toast(t('messages.csvChosen'), 'success');
}

async function importMt5() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.importMT5(model.accountId));
    if (!result.cancelled) {
      await refreshStateAndRender();
      toast(`${t('messages.mt5Imported')} ${result.added}`, 'success');
    }
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function importFundedNext() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.importFundedNext(model.accountId));
    if (!result.cancelled) {
      await refreshStateAndRender();
      toast(`${t('messages.fundedNextImported')} ${result.added}`, 'success');
    }
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function watchFundedNext() {
  const result = await runBusy(t('ui.loading'), () => cisd.watchFundedNext(model.accountId));
  if (!result.cancelled) {
    await refreshStateAndRender();
    toast(t('messages.fundedNextWatchEnabled'), 'success');
  }
}

function renderChartSlots() {
  for (const slot of ['before', 'after']) {
    const key = slot === 'before' ? 'beforeImage' : 'afterImage';
    const value = model.tradeCharts[key];
    const cap = slot === 'before' ? 'Before' : 'After';
    const preview = $(`#tradeChart${cap}Preview`);
    preview.innerHTML = value
      ? `<img src="${escapeHtml(`file://${value}`)}" alt="">`
      : `<span class="chart-slot-empty">${escapeHtml(t('journal.charts.empty'))}</span>`;
    $(`#tradeChart${cap}Clear`).classList.toggle('hidden', !value);
  }
}

async function attachTradeChart(slot) {
  try {
    const filePath = await cisd.chooseImage();
    if (!filePath) return;
    model.tradeCharts[slot === 'before' ? 'beforeImage' : 'afterImage'] = filePath;
    renderChartSlots();
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

function clearTradeChart(slot) {
  model.tradeCharts[slot === 'before' ? 'beforeImage' : 'afterImage'] = '';
  renderChartSlots();
}

async function exportTrades() {
  const account = activeAccount();
  if (!account) return;
  const hasTrades = (model.state?.trades || []).some((trade) => trade.accountId === account.id);
  if (!hasTrades) {
    toast(t('journal.exportEmpty'), 'warn');
    return;
  }
  try {
    const filePath = await runBusy(t('ui.loading'), () => cisd.exportTrades(account.id));
    if (filePath) toast(t('journal.exported'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function resetCurrentAccount() {
  const account = activeAccount();
  if (!account) return;
  const ok = await openConfirm({
    title: t('settings.resetConfirmTitle'),
    text: t('settings.resetConfirmText'),
    confirmLabel: t('settings.resetAccount'),
    typeToConfirm: 'RESET',
  });
  if (!ok) return;
  try {
    model.state = await runBusy(t('ui.loading'), () => cisd.resetAccount(account.id));
    await refreshSnapshots();
    render();
    toast(t('settings.resetDone'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function backupData() {
  const path = await runBusy(t('ui.loading'), () => cisd.backup());
  if (path) toast(t('messages.backupSaved'), 'success');
}

async function restoreData() {
  const ok = await openConfirm({
    title: t('settings.restore'),
    text: t('settings.restoreConfirm'),
    confirmLabel: t('settings.restore'),
  });
  if (!ok) return;
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.restore());
    if (!result.cancelled) {
      await refreshStateAndRender();
      toast(t('messages.backupRestored'), 'success');
    }
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function openGuide() {
  const result = await cisd.openGuide();
  if (result) toast(result, 'info');
}

async function restartOnboarding() {
  model.state = await runBusy(t('ui.loading'), () => cisd.resetOnboarding());
  render();
  toast(t('messages.onboardingRestarted'), 'success');
}

async function updateFilters() {
  model.filters.period = $('#filterPeriod').value;
  model.filters.source = $('#filterSource').value;
  model.filters.instrument = $('#filterInstrument').value;
  model.filters.side = $('#filterSide').value;
  model.filters.session = $('#filterSession').value;
  persistUiState();
  await refreshSnapshots();
  render();
}

function fillPeriodOptions() {
  $('#filterPeriod').innerHTML = [
    ['all', t('analytics.filters.allTime')],
    ['today', t('analytics.filters.today')],
    ['week', t('analytics.filters.week')],
    ['month', t('analytics.filters.month')],
  ].map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
  $('#filterPeriod').value = model.filters.period;
}
