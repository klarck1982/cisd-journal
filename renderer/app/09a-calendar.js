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
      if (!cell.traded) {
        return `<div class="calendar-cell quiet"><span class="calendar-day">${cell.dayNumber}</span></div>`;
      }
      const tone = calendarTone(cell.value);
      const isBest = calendar.best && calendar.best.day === cell.day;
      const isWorst = calendar.worst && calendar.worst.day === cell.day;
      return `
        <div class="calendar-cell ${tone}${isBest ? ' best' : ''}${isWorst ? ' worst' : ''}"
             title="${escapeHtml(cell.day)} · ${cell.count} ${escapeHtml(t('playbooks.card.trades'))}">
          <span class="calendar-day">${cell.dayNumber}</span>
          <span class="calendar-value">${escapeHtml(calendarValueLabel(cell.value, unit))}</span>
          <span class="calendar-count">${cell.count}</span>
        </div>
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
