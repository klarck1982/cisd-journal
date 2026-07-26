/**
 * Edge page: hesitation tax, reason attribution, expectancy and edge score.
 */

function renderEdge() {
  const edge = model.edge;
  if (!edge) return;

  const unit = edge.unit;
  const hesitation = edge.hesitation;
  const hasAnyData = edge.executed.count > 0 || hesitation.missedCount > 0;

  $('#edgeScoreValue').textContent = hasAnyData ? formatNumber(edge.edgeScore.score, 0) : '—';
  $('#edgeScoreGrade').textContent = hasAnyData ? edge.edgeScore.grade : '—';
  $('#edgeScoreGrade').className = `chip ${edge.edgeScore.score >= 65 ? 'safe' : edge.edgeScore.score >= 45 ? 'warn' : 'bad'}`;

  // --- Hesitation hero: the headline this product exists to show -------------
  if (!hasAnyData) {
    $('#edgeHesitationHeadline').textContent = t('edge.empty');
    $('#edgeHesitationNote').textContent = '';
    $('#edgeHesitationCards').innerHTML = '';
  } else {
    $('#edgeHesitationHeadline').innerHTML = hesitation.taxR > 0
      ? escapeHtml(t('edge.hesitationHeadline', {
          value: formatEdgeValue(-hesitation.taxR, unit),
          count: hesitation.missedCount,
        }))
      : escapeHtml(t('edge.hesitationClean'));

    $('#edgeHesitationNote').textContent = hesitation.hasEstimates
      ? t('edge.hesitationEstimate', { count: hesitation.estimatedCount })
      : '';

    $('#edgeHesitationCards').innerHTML = [
      metricCard(t('edge.taxLabel'), formatEdgeValue(-hesitation.taxR, unit), t('edge.taxHint'), hesitation.taxR > 0 ? 'bad' : '', 'risk'),
      metricCard(t('edge.protectedLabel'), formatEdgeValue(hesitation.protectedR, unit), t('edge.protectedHint'), hesitation.protectedR > 0 ? 'good' : '', 'discipline'),
      metricCard(t('edge.netLabel'), formatEdgeValue(hesitation.totalR, unit), t('edge.netHint'), hesitation.totalR >= 0 ? 'good' : 'bad', 'curve'),
    ].join('');
  }

  // --- Cost attribution per reason ------------------------------------------
  $('#edgeReasonsList').innerHTML = renderListRows(hesitation.byReason, (item) => {
    const verdictLabel = item.verdict === 'costly'
      ? t('edge.reasonCostly')
      : item.verdict === 'protective' ? t('edge.reasonProtective') : t('edge.reasonNeutral');
    const cls = item.verdict === 'costly' ? 'bad' : item.verdict === 'protective' ? 'safe' : 'neutral';
    return `
      <article class="item reason-card ${cls}">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(t(`signals.reasonModal.presets.${item.reason}`) !== `signals.reasonModal.presets.${item.reason}` ? t(`signals.reasonModal.presets.${item.reason}`) : item.reason)}</div>
            <div class="item-subtitle">${item.count} · ${escapeHtml(verdictLabel)}${item.estimatedCount ? ` · ${item.estimatedCount} ${escapeHtml(t('edge.reasonEstimated'))}` : ''}</div>
          </div>
          <div class="${item.value >= 0 ? 'value-good' : 'value-bad'}">${escapeHtml(formatEdgeValue(item.value, unit))}</div>
        </div>
      </article>
    `;
  }, 'reasons');

  // --- Realised vs available -------------------------------------------------
  const potential = edge.potential;
  const scale = Math.max(Math.abs(potential.realisedNet), Math.abs(potential.potentialNet), 1);
  const bar = (label, value, cls) => `
    <div class="potential-row">
      <span class="potential-label">${escapeHtml(label)}</span>
      <div class="potential-track"><i class="${cls}" style="width:${Math.max(2, (Math.abs(value) / scale) * 100)}%"></i></div>
      <span class="potential-value ${value >= 0 ? 'value-good' : 'value-bad'}">${escapeHtml(formatEdgeValue(value, unit))}</span>
    </div>
  `;
  $('#edgePotentialBars').innerHTML = [
    bar(t('edge.realised'), potential.realisedNet, 'realised'),
    bar(t('edge.missed'), potential.missedNet, 'missed'),
    bar(t('edge.potential'), potential.potentialNet, 'potential'),
  ].join('');
  $('#edgeUplift').textContent = potential.upliftRatio && potential.upliftRatio > 1
    ? t('edge.uplift', { value: formatNumber(potential.upliftRatio, 2) })
    : '';

  // --- Core trade statistics -------------------------------------------------
  const stats = edge.executed;
  $('#edgeStatsCards').innerHTML = [
    metricCard(t('edge.stats.expectancy'), formatEdgeValue(stats.expectancy, unit), t('edge.stats.expectancyHint'), stats.expectancy >= 0 ? 'good' : 'bad', 'analytics'),
    metricCard(t('edge.stats.payoff'), stats.payoffRatio === null ? '—' : formatNumber(stats.payoffRatio, 2), t('edge.stats.payoffHint'), stats.payoffRatio && stats.payoffRatio >= 1 ? 'good' : 'warn', 'balance'),
    metricCard(t('edge.stats.profitFactor'), stats.profitFactor === null ? '—' : formatNumber(stats.profitFactor, 2), t('edge.stats.profitFactorHint'), stats.profitFactor && stats.profitFactor >= 1.5 ? 'good' : 'warn', 'curve'),
    metricCard(t('edge.stats.winRate'), formatPercent(stats.winRate), t('edge.stats.winRateHint'), stats.winRate >= 0.5 ? 'good' : '', 'discipline'),
    metricCard(t('edge.stats.avgWin'), formatEdgeValue(stats.averageWin, unit), '', 'good', 'position'),
    metricCard(t('edge.stats.avgLoss'), formatEdgeValue(-stats.averageLoss, unit), '', 'bad', 'risk'),
    metricCard(t('edge.stats.kelly'), stats.kelly === null ? '—' : formatPercent(stats.kelly), t('edge.stats.kellyHint'), '', 'challenge'),
    metricCard(t('analytics.tradesCount'), String(stats.count), '', '', 'signals'),
  ].join('');

  // --- R distribution --------------------------------------------------------
  const maxBucket = Math.max(1, ...edge.distribution.map((item) => item.count));
  $('#edgeDistribution').innerHTML = edge.distribution.map((item) => {
    const negative = item.key.startsWith('lte') || item.key.startsWith('-');
    return `
      <div class="r-bucket">
        <span class="r-bucket-label">${escapeHtml(item.label)}</span>
        <div class="r-bucket-track"><i class="${negative ? 'neg' : 'pos'}" style="width:${(item.count / maxBucket) * 100}%"></i></div>
        <span class="r-bucket-count">${item.count}</span>
      </div>
    `;
  }).join('');

  // --- Score breakdown -------------------------------------------------------
  const componentKeys = ['execution', 'discipline', 'expectancy', 'riskControl', 'consistency'];
  $('#edgeScoreComponents').innerHTML = componentKeys.map((key) => {
    const value = edge.edgeScore.components[key] || 0;
    return `
      <div class="score-row">
        <span class="score-label">${escapeHtml(t(`edge.components.${key}`))}</span>
        <div class="score-track"><i style="width:${Math.max(0, Math.min(100, value))}%"></i></div>
        <span class="score-value">${formatNumber(value, 0)}</span>
      </div>
    `;
  }).join('');

  renderExitQuality();

  // --- Prioritised insights --------------------------------------------------
  $('#edgeInsightsList').innerHTML = renderListRows(edge.insights, (item) => {
    const cls = item.severity === 'critical' ? 'bad' : item.severity === 'good' ? 'safe' : 'warn';
    const reasonLabel = item.reason
      ? (t(`signals.reasonModal.presets.${item.reason}`) !== `signals.reasonModal.presets.${item.reason}`
          ? t(`signals.reasonModal.presets.${item.reason}`)
          : item.reason)
      : '';
    const text = t(`edge.insights.${item.code}`, {
      reason: reasonLabel,
      count: item.count ?? 0,
      value: item.value !== undefined ? formatEdgeValue(item.value, unit) : '',
    });
    return `
      <article class="item insight-card ${cls}">
        <div class="item-head">
          <div class="item-title insight-text">${escapeHtml(text)}</div>
          <span class="chip ${cls}"></span>
        </div>
      </article>
    `;
  }, 'insights');
}

function renderExitQuality() {
  const exit = model.edge?.exitQuality;
  if (!exit) return;

  const unit = model.edge.unit;
  const insight = $('#edgeExitInsight');
  const wrap = $('#edgeExitWorstWrap');

  if (!exit.totals.classified) {
    insight.className = 'hero-insight';
    insight.innerHTML = `<p>${escapeHtml(t('edge.exit.empty'))}</p>`;
    $('#edgeExitCards').innerHTML = '';
    $('#edgeExitBreakdown').innerHTML = '';
    wrap.classList.add('hidden');
    return;
  }

  if (exit.cutsWinnersEarly) {
    insight.className = 'hero-insight bad';
    insight.innerHTML = `<p>${escapeHtml(t('edge.exit.cutsEarly', {
      value: formatEdgeValue(-exit.leftOnTable, unit),
    }))}</p>`;
  } else if (exit.hasEvidence) {
    insight.className = 'hero-insight good';
    insight.innerHTML = `<p>${escapeHtml(t('edge.exit.healthy'))}</p>`;
  } else {
    insight.className = 'hero-insight';
    insight.innerHTML = `<p>${escapeHtml(t('edge.exit.empty'))}</p>`;
  }

  $('#edgeExitCards').innerHTML = [
    metricCard(
      t('edge.exit.capture'),
      exit.targetCapture === null ? '—' : formatPercent(exit.targetCapture, 0),
      t('edge.exit.captureHint'),
      exit.targetCapture === null ? '' : exit.targetCapture >= 0.8 ? 'good' : 'warn',
      'challenge'
    ),
    metricCard(
      t('edge.exit.leftOnTable'),
      formatEdgeValue(-exit.leftOnTable, unit),
      t('edge.exit.leftHint'),
      exit.leftOnTable > 0 ? 'bad' : '',
      'curve'
    ),
    metricCard(
      t('edge.exit.avgShortfall'),
      exit.averageShortfall ? formatEdgeValue(-exit.averageShortfall, unit) : '—',
      t('edge.exit.avgShortfallHint'),
      '',
      'analytics'
    ),
  ].join('');

  const order = ['target', 'beyondTarget', 'early', 'breakeven', 'smallLoss', 'stopped'];
  const max = Math.max(1, ...order.map((key) => exit.breakdown[key] || 0));
  $('#edgeExitBreakdown').innerHTML = order.map((key) => {
    const count = exit.breakdown[key] || 0;
    const good = key === 'target' || key === 'beyondTarget';
    return `
      <div class="exit-row">
        <span class="exit-label">${escapeHtml(t(`edge.exit.breakdown.${key}`))}</span>
        <div class="exit-track"><i class="${good ? 'pos' : key === 'early' ? 'warn' : 'neg'}" style="width:${(count / max) * 100}%"></i></div>
        <span class="exit-count">${count}</span>
      </div>
    `;
  }).join('');

  wrap.classList.toggle('hidden', !exit.worstExits.length);
  $('#edgeExitWorst').innerHTML = renderListRows(exit.worstExits, (item) => `
    <article class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(item.symbol || t('ui.unknown'))}</div>
          <div class="item-subtitle">${escapeHtml(formatShortDate(item.date))} · ${escapeHtml(t('edge.exit.planned'))} ${formatNumber(item.planned, 2)}R · ${escapeHtml(t('edge.exit.captured'))} ${formatNumber(item.captured, 2)}R</div>
        </div>
        <div class="value-bad">${escapeHtml(formatEdgeValue(-item.shortfall, unit))}</div>
      </div>
    </article>
  `);
}
