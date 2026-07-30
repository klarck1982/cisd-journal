/**
 * Monthly P&L calendar on the analytics page.
 * Reads the snapshot produced by lib/engines/calendar.js and paints a 7-column grid.
 */

function calendarValueLabel(value, unit) {
  if (!value) return '';
  const sign = value > 0 ? '+' : '';
  if (unit === 'R') return `${sign}${formatNumber(value, 2)}R`;
  return `${sign}${formatNumber(value, 0)}`;
}

function calendarTone(value) {
  if (value > 0) return 'green';
  if (value < 0) return 'red';
  return 'flat';
}

function renderCalendar() {
  const payload = model.calendar;
  if (!payload) return;

  const calendar = payload.calendar;
  const unit = calendar.unit;

  // Month switcher. Always include the month currently shown, even if it has no trades.
  const months = [...new Set([calendar.month, ...(payload.months || [])])].sort().reverse();
  const select = $('#calendarMonthSelect');
  select.innerHTML = months.map((month) => `<option value="${escapeHtml(month)}">${escapeHtml(month)}</option>`).join('');
  select.value = calendar.month;

  $('#calendarCards').innerHTML = [
    metricCard(
      t('analytics.calendar.net'),
      calendarValueLabel(calendar.totals.net, unit) || (unit === 'R' ? '0R' : '0'),
      '',
      calendar.totals.net > 0 ? 'good' : calendar.totals.net < 0 ? 'bad' : '',
      'curve'
    ),
    metricCard(t('analytics.calendar.tradedDays'), String(calendar.totals.tradedDays), '', '', 'journal'),
    metricCard(
      t('analytics.calendar.dayWinRate'),
      `${calendar.totals.greenDays}/${calendar.totals.tradedDays || 0}`,
      formatPercent(calendar.totals.dayWinRate, 0),
      calendar.totals.dayWinRate >= 0.5 ? 'good' : 'warn',
      'discipline'
    ),
    metricCard(
      t('analytics.calendar.avgDay'),
      calendarValueLabel(calendar.totals.averageDay, unit) || (unit === 'R' ? '0R' : '0'),
      '',
      calendar.totals.averageDay >= 0 ? 'good' : 'bad',
      'analytics'
    ),
  ].join('');

  const weekdayOrder = Array.from({ length: 7 }, (_, index) => (calendar.weekStartsOn + index) % 7);
  const header = weekdayOrder
    .map((weekday) => `<div class="calendar-head-cell">${escapeHtml(t(`analytics.calendar.weekdays.${weekday}`))}</div>`)
    .join('');

  const rows = calendar.weeks.map((week) => {
    const cells = week.cells.map((cell) => {
      if (cell.empty) return '<div class="calendar-cell empty"></div>';
      const isToday = cell.day === todayKey();
      const hasNote = (model.state?.daily || []).some((entry) => entry.accountId === model.accountId && entry.day === cell.day && entry.calendarNote);
      const tone = calendarTone(cell.value);
      const isBest = calendar.best && calendar.best.day === cell.day;
      const isWorst = calendar.worst && calendar.worst.day === cell.day;
      return `
        <button class="calendar-cell ${cell.traded ? tone : 'quiet'}${isToday ? ' today' : ''}${hasNote ? ' has-note' : ''}${isBest ? ' best' : ''}${isWorst ? ' worst' : ''}"
             data-calendar-day="${escapeHtml(cell.day)}"
             title="${escapeHtml(cell.day)} · ${cell.count || 0} ${escapeHtml(t('playbooks.card.trades'))}">
          <span class="calendar-day">${cell.dayNumber}</span>
          ${cell.traded ? `<span class="calendar-value">${escapeHtml(calendarValueLabel(cell.value, unit))}</span><span class="calendar-count">${cell.count}</span>` : ''}
        </button>
      `;
    }).join('');

    const weekTotal = week.tradedDays
      ? `<div class="calendar-week-total ${calendarTone(week.total)}">${escapeHtml(calendarValueLabel(week.total, unit))}</div>`
      : '<div class="calendar-week-total empty"></div>';

    return `<div class="calendar-row">${cells}${weekTotal}</div>`;
  }).join('');

  $('#calendarGrid').innerHTML = `
    <div class="calendar-row calendar-header">
      ${header}
      <div class="calendar-head-cell total">${escapeHtml(t('analytics.calendar.week'))}</div>
    </div>
    ${rows}
  `;

  $$('[data-calendar-day]').forEach((button) => {
    button.onclick = () => openCalendarDay(button.dataset.calendarDay);
  });

  // Weekday performance strip: the pattern most traders never notice.
  const traded = calendar.weekdays.filter((item) => item.days > 0);
  const maxAbs = Math.max(1, ...traded.map((item) => Math.abs(item.average)));
  $('#calendarWeekdays').innerHTML = traded.length
    ? traded.map((item) => `
        <div class="weekday-bar">
          <span class="weekday-name">${escapeHtml(t(`analytics.calendar.weekdays.${item.weekday}`))}</span>
          <div class="weekday-track">
            <i class="${item.average >= 0 ? 'pos' : 'neg'}" style="width:${Math.max(4, (Math.abs(item.average) / maxAbs) * 100)}%"></i>
          </div>
          <span class="${item.average >= 0 ? 'value-good' : 'value-bad'}">${escapeHtml(calendarValueLabel(item.average, unit) || '—')}</span>
        </div>
      `).join('')
    : `<div class="empty-state">${escapeHtml(t('analytics.calendar.noTrades'))}</div>`;
}

async function changeCalendarMonth() {
  model.calendarMonth = $('#calendarMonthSelect').value;
  persistUiState();
  model.calendar = await cisd.calendarMonth(model.accountId, { month: model.calendarMonth });
  renderCalendar();
}


function openCalendarDay(day) {
  model.calendarDayDetail = day;
  const account = activeAccount();
  const trades = (model.state?.trades || []).filter((trade) => trade.accountId === account?.id && String(trade.date || trade.createdAt || '').slice(0, 10) === day);
  const net = trades.reduce((sum, trade) => sum + (Number(trade.netProfit ?? trade.profit) || 0), 0);
  const entry = (model.state?.daily || []).find((item) => item.accountId === account?.id && item.day === day) || {};
  const news = (model.state?.newsHistory || []).filter((item) => String(item.Date || item.date || '').slice(0, 10) === day);
  $('#calendarDayModalTitle').textContent = `${t('calendar.dayDetails')} · ${day}`;
  $('#calendarDayMetrics').innerHTML = [
    metricCard(t('daily.metrics.trades'), String(trades.length), '', '', 'journal'),
    metricCard(t('daily.metrics.net'), `${net > 0 ? '+' : ''}${formatCurrency(net, account?.currency)}`, '', net >= 0 ? 'good' : 'bad', 'curve'),
  ].join('');
  $('#calendarDayNews').innerHTML = news.length ? news.map((item) => `<div class="item"><div class="item-title">${escapeHtml(item.Country || '')} · ${escapeHtml(item.Event || '')}</div><div class="item-subtitle">${escapeHtml(formatDateTime(item.Date || ''))}</div></div>`).join('') : emptyState(t('calendar.noNews'));
  $('#calendarDayNote').value = entry.calendarNote || '';
  $('#calendarDayModal').classList.remove('hidden');
}

function closeCalendarDay() { $('#calendarDayModal').classList.add('hidden'); model.calendarDayDetail = ''; }

async function saveCalendarDayNote() {
  const account = activeAccount();
  if (!account || !model.calendarDayDetail) return;
  const day = model.calendarDayDetail;
  const existing = (model.state?.daily || []).find((item) => item.accountId === account.id && item.day === day) || {};
  model.state = await runBusy(t('ui.loading'), () => cisd.saveDaily(day, { ...existing, accountId: account.id, calendarNote: $('#calendarDayNote').value.trim() }));
  await refreshSnapshots();
  renderCalendar();
  toast(t('calendar.saved'), 'success');
}
