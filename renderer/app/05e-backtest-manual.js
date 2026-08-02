/** Independent manual trades recorded inside the selected backtest session. */

function backtestManualDay(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    timeZone: model.state?.settings?.timezone || 'America/New_York',
  }).format(date);
}

function openBacktestManualTradeModal() {
  const session = selectedBacktest();
  if (!session) {
    toast(t('backtest.manual.noSession'), 'warn');
    return;
  }
  const filters = session.filters || {};
  const focusSignal = backtestSignalById(model.selectedBacktestSignalId);
  $('#backtestManualTradeForm')?.reset();
  $('#backtestManualInstrument').value = filters.symbol || '';
  $('#backtestManualDate').value = focusSignal?.signalAt ? new Intl.DateTimeFormat('en-CA', { timeZone: model.state?.settings?.timezone || 'America/New_York' }).format(new Date(focusSignal.signalAt)) : (filters.start || todayKey());
  $('#backtestManualSession').value = filters.session || focusSignal?.Session || '';
  $('#backtestManualTradeModal').classList.remove('hidden');
  $('#backtestManualDirection').focus();
}

function closeBacktestManualTradeModal() {
  $('#backtestManualTradeModal').classList.add('hidden');
}

async function saveBacktestManualTrade(event) {
  event?.preventDefault();
  const session = selectedBacktest();
  if (!session) return;
  const resultR = $('#backtestManualResult').value.trim();
  if (!resultR || !Number.isFinite(Number(resultR))) {
    toast(t('backtest.manual.resultRequired'), 'warn');
    $('#backtestManualResult').focus();
    return;
  }
  const date = $('#backtestManualDate').value || todayKey();
  const sessionLabel = $('#backtestManualSession').value || session.filters?.session || '';
  if ((session.filters?.start && date < session.filters.start) || (session.filters?.end && date > session.filters.end)) {
    toast(t('backtest.manual.dateOutside'), 'warn');
    return;
  }
  try {
    await runBusy(t('ui.loading'), () => cisd.addTrade({
      accountId: model.accountId,
      backtestId: session.id,
      source: 'BACKTEST_MANUAL',
      symbol: $('#backtestManualInstrument').value || session.filters?.symbol || '',
      side: $('#backtestManualDirection').value,
      date,
      day: backtestManualDay(date),
      session: sessionLabel,
      resultR: Number(resultR),
      outcome: $('#backtestManualOutcome').value,
      note: $('#backtestManualNote').value.trim(),
      signalId: '',
    }));
    await refreshStateAndRender();
    closeBacktestManualTradeModal();
    toast(t('backtest.manual.saved'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}
