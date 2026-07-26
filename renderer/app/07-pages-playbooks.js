/**
 * Playbooks page: strategy definition, rule adherence and skipped-signal cost.
 */

function visiblePlaybooks() {
  return (model.state?.playbooks || []).filter(
    (playbook) => !playbook.archived && (!playbook.accountId || playbook.accountId === model.accountId)
  );
}

function openPlaybookModal() {
  $('#playbookName').value = '';
  $('#playbookDescription').value = '';
  $('#playbookRules').value = '';
  $('#playbookMaxRisk').value = '1';
  $('#playbookMaxTrades').value = '';
  $('#playbookSymbol').value = '';
  $('#playbookSession').value = '';
  $('#playbookTimeframe').value = '';
  $('#playbookModal').classList.remove('hidden');
  $('#playbookName').focus();
}

function closePlaybookModal() {
  $('#playbookModal').classList.add('hidden');
}

async function savePlaybook(event) {
  event?.preventDefault();
  const name = $('#playbookName').value.trim();
  if (!name) {
    toast(t('playbooks.form.nameRequired'), 'warn');
    $('#playbookName').focus();
    return;
  }

  const rules = $('#playbookRules').value.split('\n').map((line) => line.trim()).filter(Boolean);
  if (!rules.length) {
    toast(t('playbooks.form.rulesRequired'), 'warn');
    $('#playbookRules').focus();
    return;
  }

  model.state = await runBusy(t('ui.loading'), () => cisd.savePlaybook({
    accountId: model.accountId,
    name,
    description: $('#playbookDescription').value.trim(),
    rules,
    maxRiskPercent: Number($('#playbookMaxRisk').value || 0),
    maxTradesPerDay: Number($('#playbookMaxTrades').value || 0),
    match: {
      symbol: $('#playbookSymbol').value.trim(),
      session: $('#playbookSession').value.trim(),
      timeframe: $('#playbookTimeframe').value.trim(),
    },
  }));

  closePlaybookModal();
  await refreshSnapshots();
  render();
  toast(t('playbooks.card.saved'), 'success');
}

async function deletePlaybook(id) {
  const ok = await openConfirm({
    title: t('playbooks.card.delete'),
    text: t('playbooks.card.deleteConfirm'),
    confirmLabel: t('playbooks.card.delete'),
  });
  if (!ok) return;
  model.state = await runBusy(t('ui.loading'), () => cisd.deletePlaybook(id));
  await refreshSnapshots();
  render();
  toast(t('playbooks.card.deleted'), 'success');
}

function renderPlaybooks() {
  const overview = model.playbooks;
  if (!overview) return;

  const totalMissed = overview.totalMissedValueR || 0;
  $('#playbooksSummary').innerHTML = overview.count ? [
    metricCard(
      t('playbooks.summary.best'),
      overview.bestPlaybook?.name || '—',
      overview.bestPlaybook ? `${overview.bestPlaybook.followed.average > 0 ? '+' : ''}${formatNumber(overview.bestPlaybook.followed.average, 2)}R` : '',
      'good',
      'discipline'
    ),
    metricCard(
      t('playbooks.summary.worst'),
      overview.worstPlaybook?.name || '—',
      overview.worstPlaybook ? `${overview.worstPlaybook.followed.average > 0 ? '+' : ''}${formatNumber(overview.worstPlaybook.followed.average, 2)}R` : '',
      'warn',
      'risk'
    ),
    metricCard(
      t('playbooks.summary.totalMissed'),
      `${formatNumber(totalMissed, 2)}R`,
      t('playbooks.summary.totalMissedHint'),
      totalMissed > 0 ? 'bad' : '',
      'curve'
    ),
  ].join('') : '';

  if (!overview.count) {
    $('#playbooksList').innerHTML = guidedEmpty('playbooks', 'newPlaybook');
    return;
  }

  $('#playbooksList').innerHTML = overview.reports.map((report) => {
    const adherence = report.adherenceRate === null ? null : report.adherenceRate;
    const hasSplit = report.followed.count > 0 && report.broken.count > 0;
    return `
      <article class="item playbook-card">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(report.name)}</div>
            <div class="item-subtitle">${report.totals.trades} ${escapeHtml(t('playbooks.card.trades'))}</div>
          </div>
          <div class="playbook-actions">
            <span class="chip ${adherence === null ? 'neutral' : adherence >= 0.8 ? 'safe' : adherence >= 0.5 ? 'warn' : 'bad'}">
              ${escapeHtml(t('playbooks.card.adherence'))}: ${adherence === null ? '—' : escapeHtml(formatPercent(adherence, 0))}
            </span>
            <button class="ghost small danger" data-playbook-delete="${escapeHtml(report.playbookId)}">${escapeHtml(t('playbooks.card.delete'))}</button>
          </div>
        </div>

        <div class="playbook-split">
          <div class="split-cell good">
            <small>${escapeHtml(t('playbooks.card.followed'))}</small>
            <strong>${report.followed.count ? `${report.followed.average > 0 ? '+' : ''}${formatNumber(report.followed.average, 2)}R` : '—'}</strong>
            <span>${report.followed.count} ${escapeHtml(t('playbooks.card.trades'))}</span>
          </div>
          <div class="split-cell bad">
            <small>${escapeHtml(t('playbooks.card.broken'))}</small>
            <strong>${report.broken.count ? `${report.broken.average > 0 ? '+' : ''}${formatNumber(report.broken.average, 2)}R` : '—'}</strong>
            <span>${report.broken.count} ${escapeHtml(t('playbooks.card.trades'))}</span>
          </div>
          <div class="split-cell accent">
            <small>${escapeHtml(t('playbooks.card.edgeGap'))}</small>
            <strong>${hasSplit ? `${formatNumber(-Math.abs(report.edgeGap), 2)}R` : '—'}</strong>
            <span>${escapeHtml(hasSplit ? t('playbooks.card.edgeGap') : t('playbooks.card.noData'))}</span>
          </div>
        </div>

        ${report.signals.missed > 0 ? `
          <div class="playbook-missed">
            <span class="tag bad">${escapeHtml(t('playbooks.card.missedTitle'))}: ${report.signals.missed}</span>
            <span class="tag neutral">${escapeHtml(t('playbooks.card.missedValue'))}: ${formatNumber(report.signals.missedValueR, 2)}R</span>
            ${report.signals.hasEstimates ? `<span class="tag neutral">${escapeHtml(t('playbooks.card.estimated'))}</span>` : ''}
          </div>
        ` : ''}

        ${report.ruleBreaks.length ? `
          <div class="playbook-breaks">
            <small>${escapeHtml(t('playbooks.breaksTitle'))}</small>
            ${report.ruleBreaks.slice(0, 3).map((rule) => `
              <div class="break-row">
                <span class="break-text">${escapeHtml(rule.text)}</span>
                <span class="break-meta">${escapeHtml(t('playbooks.breakCount', { count: rule.count }))}</span>
                <span class="${rule.cost < 0 ? 'value-bad' : 'value-muted'}">${formatNumber(rule.cost, 2)}R</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </article>
    `;
  }).join('');

  $$('[data-playbook-delete]').forEach((button) => {
    button.onclick = () => deletePlaybook(button.dataset.playbookDelete);
  });
}

function renderTradePlaybookPicker() {
  const playbooks = visiblePlaybooks();
  const select = $('#tradePlaybook');
  const current = select.value;

  select.innerHTML = `<option value="">${escapeHtml(t('playbooks.linkNone'))}</option>${
    playbooks.map((playbook) => `<option value="${escapeHtml(playbook.id)}">${escapeHtml(playbook.name)}</option>`).join('')
  }`;
  if (current && playbooks.some((playbook) => playbook.id === current)) select.value = current;

  renderTradeRulesChecklist();
}

function renderTradeRulesChecklist() {
  const playbookId = $('#tradePlaybook').value;
  const playbook = visiblePlaybooks().find((item) => item.id === playbookId);
  const wrap = $('#tradeRulesWrap');

  if (!playbook || !playbook.rules?.length) {
    wrap.classList.add('hidden');
    $('#tradeRulesChecklist').innerHTML = '';
    return;
  }

  wrap.classList.remove('hidden');
  $('#tradeRulesChecklist').innerHTML = playbook.rules.map((rule) => `
    <label class="rule-check">
      <input type="checkbox" value="${escapeHtml(rule.id)}" checked>
      <span>${escapeHtml(rule.text)}</span>
    </label>
  `).join('');
}
