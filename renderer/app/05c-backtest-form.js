/**
 * Backtest session form: create/edit modal lifecycle, CSV picker, submit.
 * Split from 11-actions.js to honor the 450-line module contract.
 */

async function chooseBacktestCsv() {
  try {
    const result = await cisd.chooseBacktestCsv();
    if (result.cancelled) return;
    model.backtestCsvPath = result.path;
    $('#backtestCsvPathLabel').textContent = result.path;
    $('#clearBacktestCsvBtn').classList.remove('hidden');
    toast(t('messages.csvChosen'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

function clearBacktestCsv() {
  model.backtestCsvPath = '';
  $('#backtestCsvPathLabel').textContent = t('backtest.create.defaultCsvHint') || 'يستخدم الملف الحي الافتراضي';
  $('#clearBacktestCsvBtn').classList.add('hidden');
}

function openBacktestFormModal(editId = null) {
  model.editingBacktestId = editId;
  $('#backtestForm').reset();
  clearBacktestCsv();
  $('#backtestCapture').checked = true;

  if (editId) {
    const session = (model.state?.backtests || []).find((item) => item.id === editId);
    if (session) {
      $('#backtestName').value = session.name || '';
      $('#backtestStart').value = session.filters?.start || '';
      $('#backtestEnd').value = session.filters?.end || '';
      $('#backtestSession').value = session.filters?.session || '';
      $('#backtestSymbol').value = session.filters?.symbol || '';
      $('#backtestTf').value = session.filters?.tf || '';
      $('#backtestCapture').checked = session.captureEnabled !== false;
      if (session.backtestCsvPath) {
        model.backtestCsvPath = session.backtestCsvPath;
        $('#backtestCsvPathLabel').textContent = session.backtestCsvPath;
        $('#clearBacktestCsvBtn').classList.remove('hidden');
      }
    }
  }

  $('#backtestCreateTitle').textContent = editId ? t('backtest.create.editTitle') : t('backtest.create.title');
  $('#backtestCreateHint').textContent = t('backtest.create.hint');
  $('#backtestStartBtn').textContent = editId ? t('backtest.create.update') : t('backtest.create.save');
  $('#backtestFormModal').classList.remove('hidden');
  $('#backtestName').focus();
}

function closeBacktestFormModal() {
  model.editingBacktestId = null;
  $('#backtestFormModal').classList.add('hidden');
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
    backtestCsvPath: model.backtestCsvPath || '',
    captureEnabled: $('#backtestCapture').checked,
  };
  if (!payload.start || !payload.end) {
    toast(t('backtest.create.dateRequired') || 'اختر تاريخ البداية والنهاية ليطابق JForex Replay', 'warn');
    return;
  }
  try {
    if (model.editingBacktestId) {
      await runBusy(t('ui.loading'), () =>
        cisd.updateBacktest(model.editingBacktestId, {
          name: payload.name,
          backtestCsvPath: payload.backtestCsvPath,
          captureEnabled: payload.captureEnabled,
          filters: {
            start: payload.start,
            end: payload.end,
            session: payload.session,
            symbol: payload.symbol,
            tf: payload.tf,
          },
        })
      );
      model.selectedBacktestId = model.editingBacktestId;
      persistUiState();
      await refreshStateAndRender();
      closeBacktestFormModal();
      $('#backtestForm').reset();
      clearBacktestCsv();
      toast(t('backtest.library.updated'), 'success');
      return;
    }
    const result = await runBusy(t('ui.loading'), () => cisd.startBacktest(payload));
    model.selectedBacktestId = result.state?.activeBacktestId || result.state?.backtests?.[0]?.id || null;
    persistUiState();
    await refreshStateAndRender();
    closeBacktestFormModal();
    $('#backtestForm').reset();
    clearBacktestCsv();
    toast(`${t('messages.backtestImported')} ${result.count} - الفترة: ${payload.start} إلى ${payload.end}`, 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

