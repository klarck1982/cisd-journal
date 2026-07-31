/**
 * Trade correction: edit and delete for an already-logged trade.
 *
 * Split out of 05-pages-trading.js to keep every renderer module under the
 * 450-line guard enforced by qa/renderer-contract-tests.js.
 *
 * Before this existed the only trade operations were add and export, so a
 * mistyped R could only be corrected by resetting the whole account — which
 * destroyed every other trade, and (until this pass) the account's risk
 * limits with them.
 */

/**
 * Edit / delete on each logged trade.
 *
 * Previously the only trade operations were add and export, so a mistyped R
 * could only be corrected by resetting the entire account — destroying every
 * other trade to repair one.
 */
function bindTradeRowActions() {
  $$('[data-trade-open]').forEach((button) => {
    button.onclick = () => openTradeDetailModal(button.dataset.tradeOpen);
  });
  $$('[data-trade-edit]').forEach((button) => {
    button.onclick = () => openTradeEditModal(button.dataset.tradeEdit);
  });
  $$('[data-trade-delete]').forEach((button) => {
    button.onclick = () => deleteTrade(button.dataset.tradeDelete);
  });
}

function findTrade(tradeId) {
  return (model.state?.trades || []).find((trade) => trade.id === tradeId) || null;
}

function openTradeEditModal(tradeId) {
  const trade = findTrade(tradeId);
  if (!trade) return;

  model.editingTradeId = tradeId;
  $('#tradeEditInstrument').value = trade.symbol || '';
  $('#tradeEditSide').value = trade.side === 'Sell' ? 'Sell' : 'Buy';
  $('#tradeEditDate').value = String(trade.date || '').slice(0, 10);
  $('#tradeEditResult').value = trade.resultR ?? '';
  $('#tradeEditProfit').value = trade.netProfit ?? trade.profit ?? '';
  $('#tradeEditNote').value = trade.note || '';
  $('#tradeEditModal').classList.remove('hidden');
  $('#tradeEditInstrument').focus();
}

function closeTradeEditModal() {
  model.editingTradeId = null;
  $('#tradeEditModal').classList.add('hidden');
}

async function saveTradeEdit(event) {
  event?.preventDefault();
  if (!model.editingTradeId) return;

  const symbol = $('#tradeEditInstrument').value.trim();
  if (!symbol) {
    toast(t('journal.form.symbolRequired'), 'warn');
    $('#tradeEditInstrument').focus();
    return;
  }

  // Blank numeric fields clear the value rather than coercing to 0, so an
  // unknown R stays unknown instead of silently becoming break-even.
  const rawResult = $('#tradeEditResult').value.trim();
  const rawProfit = $('#tradeEditProfit').value.trim();

  model.state = await runBusy(t('ui.loading'), () => cisd.updateTrade(model.editingTradeId, {
    symbol,
    side: $('#tradeEditSide').value,
    date: $('#tradeEditDate').value || todayKey(),
    resultR: rawResult === '' ? null : Number(rawResult),
    netProfit: rawProfit === '' ? null : Number(rawProfit),
    note: $('#tradeEditNote').value.trim(),
  }));

  closeTradeEditModal();
  await refreshSnapshots();
  render();
  toast(t('journal.updated'), 'success');
}

async function deleteTrade(tradeId) {
  const trade = findTrade(tradeId);
  if (!trade) return;

  const confirmed = await openConfirm({
    title: t('journal.deleteConfirmTitle'),
    text: t('journal.deleteConfirmText'),
    confirmLabel: t('journal.delete'),
  });
  if (!confirmed) return;

  model.state = await runBusy(t('ui.loading'), () => cisd.deleteTrade(tradeId));
  if (model.editingTradeId === tradeId) closeTradeEditModal();
  await refreshSnapshots();
  render();
  toast(t('journal.deleted'), 'success');
}

function openTradeDetailModal(tradeId) {
  const trade = findTrade(tradeId);
  if (!trade) return;
  model.detailTradeId = tradeId;
  const account = activeAccount();
  const result = trade.resultR ?? trade.netProfit ?? 0;
  $('#tradeDetailSummary').innerHTML = [
    `<div class="stack-row"><span class="label">${escapeHtml(trade.symbol || '')} · ${escapeHtml(trade.side || '')}</span><span class="value ${classForSigned(result)}">${Number(result) > 0 ? '+' : ''}${escapeHtml(formatNumber(result, 2))}${trade.resultR !== null && trade.resultR !== undefined ? 'R' : ''}</span></div>`,
    `<div class="stack-row"><span class="label">${escapeHtml(formatShortDate(trade.date || trade.createdAt))}</span><span class="value">${trade.signalId ? escapeHtml(t('journal.detailSignal')) : 'Manual'}</span></div>`,
    `<div class="stack-row"><span class="label">${escapeHtml(trade.tags || '—')}</span><span class="value">${escapeHtml(trade.note || '—')}</span></div>`,
  ].join('');
  const image = (path) => path ? `<img src="${escapeHtml(`file://${path}`)}" alt="">` : `<span>${escapeHtml(t('journal.detailNoImage'))}</span>`;
  $('#tradeDetailBefore').innerHTML = image(trade.beforeImage);
  $('#tradeDetailAfter').innerHTML = image(trade.afterImage);
  $('#tradeDetailModal').classList.remove('hidden');
  $('#tradeDetailCloseBtn').focus();
}

function closeTradeDetailModal() {
  model.detailTradeId = null;
  $('#tradeDetailModal').classList.add('hidden');
}
