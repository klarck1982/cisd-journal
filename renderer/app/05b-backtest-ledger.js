/**
 * Isolated backtest trade ledger.
 * These rows are deliberately not journal trades: a simulation may be freely
 * corrected or deleted without changing funded-account performance.
 */
function renderBacktestLedger(session) {
  const title = $('#backtestLedgerTitle');
  const hint = $('#backtestLedgerHint');
  const list = $('#backtestLedgerList');
  if (!title || !hint || !list) return;

  title.textContent = t('backtest.create.ledgerTitle');
  hint.textContent = t('backtest.create.ledgerHint');
  if (!session) {
    list.innerHTML = emptyState(t('backtest.spotlight.empty'));
    return;
  }

  const trades = (model.state?.backtestTrades || [])
    .filter((trade) => trade.backtestId === session.id)
    .slice()
    .sort((a, b) => String(b.createdAt || b.updatedAt || '').localeCompare(String(a.createdAt || a.updatedAt || '')));

  list.innerHTML = renderListRows(trades, (trade) => `
    <article class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(trade.symbol || '')} · ${escapeHtml(trade.side || '')}</div>
          <div class="item-subtitle">${escapeHtml(formatShortDate(trade.date || trade.createdAt))}${trade.source === 'signal' ? ' · CISD' : ' · Manual'}</div>
        </div>
        <strong class="${classForSigned(trade.pnl)}">${Number(trade.pnl) >= 0 ? '+' : ''}${escapeHtml(formatCurrency(trade.pnl || 0, session.currency || 'USD'))}</strong>
      </div>
      <div class="item-meta">
        <span class="tag ${Number(trade.resultR) >= 0 ? 'safe' : 'bad'}">${Number(trade.resultR) >= 0 ? '+' : ''}${escapeHtml(formatNumber(trade.resultR || 0, 2))}R</span>
        ${trade.note ? `<span class="tag neutral">${escapeHtml(trade.note)}</span>` : ''}
      </div>
      <div class="item-actions">
        <button class="ghost small danger" data-backtest-trade-delete="${escapeHtml(trade.id)}">${escapeHtml(t('backtest.create.ledgerDelete'))}</button>
      </div>
    </article>
  `, 'backtestSignals');

  $$('[data-backtest-trade-delete]').forEach((button) => {
    button.onclick = async () => {
      const ok = await openConfirm({
        title: t('backtest.create.ledgerDelete'),
        text: t('backtest.create.manualHint'),
        confirmLabel: t('backtest.create.ledgerDelete'),
      });
      if (!ok) return;
      try {
        model.state = await runBusy(t('ui.loading'), () => cisd.deleteBacktestTrade(button.dataset.backtestTradeDelete));
        await refreshStateAndRender();
        toast(t('backtest.create.manualSaved'), 'success');
      } catch (error) {
        toast(`${t('ui.error')}: ${error.message}`, 'error');
      }
    };
  });
}
