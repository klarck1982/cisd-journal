/**
 * Daily routine page: morning plan, evening review, mood and tilt analysis.
 */

function formatEdgeValue(value, unit, withSign = true) {
  const number = Number(value) || 0;
  const sign = withSign && number > 0 ? '+' : '';
  if (unit === 'R') return `${sign}${formatNumber(number, 2)}R`;
  return `${sign}${formatCurrency(number, activeAccount()?.currency)}`;
}

function renderDaily() {
  const snapshot = model.daily;
  if (!snapshot) return;

  const today = snapshot.todaySummary;

  // --- Today's numbers -------------------------------------------------------
  $('#dailyTodayCards').innerHTML = [
    metricCard(t('daily.metrics.trades'), String(today.performance.count), '', '', 'journal'),
    metricCard(
      t('daily.metrics.net'),
      `${today.performance.net > 0 ? '+' : ''}${formatNumber(today.performance.net, 2)}R`,
      '',
      today.performance.net >= 0 ? 'good' : 'bad',
      'curve'
    ),
    metricCard(t('daily.metrics.executed'), String(today.signals.executed), '', '', 'discipline'),
    metricCard(t('daily.metrics.missed'), String(today.signals.missed), '', today.signals.missed ? 'warn' : '', 'risk'),
    metricCard(
      t('daily.metrics.checklist'),
      `${today.checklistProgress.completed}/${today.checklistProgress.total}`,
      '',
      today.checklistProgress.rate === 1 ? 'good' : 'warn',
      'signals'
    ),
  ].join('');

  // --- Morning: mood picker + checklist -------------------------------------
  $('#dailyMoodPicker').innerHTML = snapshot.moods.map((mood) => `
    <button type="button" class="mood-chip ${today.mood === mood ? 'active' : ''}" data-mood="${escapeHtml(mood)}">
      ${escapeHtml(t(`daily.moods.${mood}`))}
    </button>
  `).join('');
  $$('[data-mood]').forEach((button) => {
    button.onclick = () => {
      model.dailyDraft.mood = button.dataset.mood;
      $$('[data-mood]').forEach((other) => other.classList.toggle('active', other === button));
    };
  });

  $('#dailyChecklist').innerHTML = snapshot.checklistKeys.map((key) => `
    <label class="rule-check">
      <input type="checkbox" data-checklist="${escapeHtml(key)}" ${today.checklist[key] ? 'checked' : ''}>
      <span>${escapeHtml(t(`daily.checklist.${key}`))}</span>
    </label>
  `).join('');

  if (document.activeElement !== $('#dailyPlan')) $('#dailyPlan').value = today.plan || '';
  if (document.activeElement !== $('#dailyWentWell')) $('#dailyWentWell').value = today.wentWell || '';
  if (document.activeElement !== $('#dailyToImprove')) $('#dailyToImprove').value = today.toImprove || '';
  $('#dailyReviewStatus').textContent = today.reviewedAt
    ? `${t('daily.eveningSaved')} · ${formatDateTime(today.reviewedAt)}`
    : t('daily.noReviewYet');

  // --- Mood vs performance ---------------------------------------------------
  const correlation = snapshot.moodCorrelation;
  const moodInsight = $('#dailyMoodInsight');
  if (correlation.hasEnoughData && correlation.best && correlation.worst) {
    moodInsight.className = 'hero-insight warn';
    moodInsight.innerHTML = `<p>${escapeHtml(t('daily.moodInsight', {
      best: `${correlation.best.average > 0 ? '+' : ''}${formatNumber(correlation.best.average, 2)}R`,
      bestMood: t(`daily.moods.${correlation.best.mood}`),
      worst: `${correlation.worst.average > 0 ? '+' : ''}${formatNumber(correlation.worst.average, 2)}R`,
      worstMood: t(`daily.moods.${correlation.worst.mood}`),
    }))}</p>`;
  } else {
    moodInsight.className = 'hero-insight';
    moodInsight.innerHTML = `<p>${escapeHtml(t('daily.moodEmpty'))}</p>`;
  }

  const maxMood = Math.max(1, ...correlation.moods.map((item) => Math.abs(item.average)));
  $('#dailyMoodRows').innerHTML = correlation.moods.map((item) => `
    <div class="mood-row ${item.reliable ? '' : 'unreliable'}">
      <span class="mood-name">${escapeHtml(t(`daily.moods.${item.mood}`))}</span>
      <div class="mood-track">
        <i class="${item.average >= 0 ? 'pos' : 'neg'}" style="width:${Math.max(4, (Math.abs(item.average) / maxMood) * 100)}%"></i>
      </div>
      <span class="${item.average >= 0 ? 'value-good' : 'value-bad'}">${item.average > 0 ? '+' : ''}${formatNumber(item.average, 2)}R</span>
      <span class="mood-days">${escapeHtml(item.reliable ? t('daily.moodDays', { count: item.days }) : t('daily.moodUnreliable'))}</span>
    </div>
  `).join('');

  // --- Tilt ------------------------------------------------------------------
  const tilt = snapshot.tilt;
  const tiltInsight = $('#dailyTiltInsight');
  if (tilt.hasEvidence && tilt.degradation !== null && tilt.degradation < 0) {
    tiltInsight.className = 'hero-insight bad';
    tiltInsight.innerHTML = `<p>${escapeHtml(t('daily.tiltInsight', {
      value: formatPercent(Math.abs(tilt.degradation), 0),
      count: tilt.threshold,
    }))}</p>`;
  } else {
    tiltInsight.className = 'hero-insight';
    tiltInsight.innerHTML = `<p>${escapeHtml(t('daily.tiltEmpty'))}</p>`;
  }

  $('#dailyTiltCells').innerHTML = `
    <div class="split-cell good">
      <small>${escapeHtml(t('daily.tiltBaseline'))}</small>
      <strong>${tilt.baseline.count ? `${tilt.baseline.average > 0 ? '+' : ''}${formatNumber(tilt.baseline.average, 2)}R` : '—'}</strong>
      <span>${tilt.baseline.count} ${escapeHtml(t('playbooks.card.trades'))}</span>
    </div>
    <div class="split-cell bad">
      <small>${escapeHtml(t('daily.tiltAfter', { count: tilt.threshold }))}</small>
      <strong>${tilt.afterLossStreak.count ? `${tilt.afterLossStreak.average > 0 ? '+' : ''}${formatNumber(tilt.afterLossStreak.average, 2)}R` : '—'}</strong>
      <span>${tilt.afterLossStreak.count} ${escapeHtml(t('playbooks.card.trades'))}</span>
    </div>
  `;

  // --- Weekly trend ----------------------------------------------------------
  const weekly = snapshot.weekly;
  const trendTone = weekly.netChange > 0 ? 'good' : weekly.netChange < 0 ? 'bad' : '';
  const trendLabel = weekly.netChange > 0
    ? t('daily.weeklyImproved')
    : weekly.netChange < 0 ? t('daily.weeklyDeclined') : t('daily.weeklyFlat');

  $('#dailyWeeklyCards').innerHTML = [
    metricCard(
      t('daily.weeklyNet'),
      `${weekly.current.net > 0 ? '+' : ''}${formatNumber(weekly.current.net, 2)}R`,
      `${weekly.netChange > 0 ? '+' : ''}${formatNumber(weekly.netChange, 2)}R · ${trendLabel}`,
      trendTone,
      'curve'
    ),
    metricCard(
      t('daily.weeklyAverage'),
      `${weekly.current.average > 0 ? '+' : ''}${formatNumber(weekly.current.average, 2)}R`,
      '',
      weekly.current.average >= 0 ? 'good' : 'bad',
      'analytics'
    ),
    metricCard(t('daily.weeklyReviews'), `${weekly.reviewedDays}/7`, '', weekly.reviewedDays >= 5 ? 'good' : 'warn', 'journal'),
  ].join('');
}

function collectDailyPayload() {
  const checklist = {};
  $$('#dailyChecklist input[data-checklist]').forEach((input) => {
    checklist[input.dataset.checklist] = input.checked;
  });
  return {
    accountId: model.accountId,
    mood: model.dailyDraft.mood || model.daily?.todaySummary?.mood || '',
    checklist,
    plan: $('#dailyPlan').value.trim(),
  };
}

async function saveMorning() {
  if (!model.accountId) return;
  const payload = collectDailyPayload();
  model.state = await runBusy(t('ui.loading'), () => cisd.saveDaily(model.daily.today, payload));
  await refreshSnapshots();
  render();
  toast(t('daily.morningSaved'), 'success');
}

async function saveEvening() {
  if (!model.accountId) return;
  const payload = {
    ...collectDailyPayload(),
    wentWell: $('#dailyWentWell').value.trim(),
    toImprove: $('#dailyToImprove').value.trim(),
  };
  model.state = await runBusy(t('ui.loading'), () => cisd.saveDaily(model.daily.today, payload));
  await refreshSnapshots();
  render();
  toast(t('daily.eveningSaved'), 'success');
}
