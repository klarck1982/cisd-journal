/**
 * Reusable render primitives shared by every page
 * (metric cards, empty states, list rows, charts, breakdowns, heatmap).
 */

/**
 * Equity curve with hover inspection + proper axis.
 *
 * Fixes previous issues that made it look primitive:
 * - preserveAspectRatio="none" caused non-uniform stretch → xMidYMid meet
 * - stroke-width 4 + glow blurred line → 2px + non-scaling-stroke + no glow
 * - No axis numbers → Y axis min/mid/max + X axis first/last date
 */
function buildCurveSvg(points) {
  if (!points.length) return emptyState(t('analytics.emptyCurve'));
  const width = 920;
  const height = 260;
  const paddingX = 56;
  const paddingY = 24;
  const chartWidth = width - paddingX * 2;
  const chartHeight = height - paddingY * 2;
  const xs = points.map((_, index) => paddingX + index * (chartWidth / Math.max(1, points.length - 1)));
  const values = points.map((point) => point.equity);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = Math.max(1, max - min);
  const yFor = (value) => height - paddingY - ((value - min) / range) * chartHeight;
  const polyline = values.map((value, index) => `${xs[index]},${yFor(value)}`).join(' ');
  const areaPoints = `${paddingX},${height - paddingY} ${polyline} ${width - paddingX},${height - paddingY}`;
  const lastX = xs[xs.length - 1];
  const lastY = yFor(values[values.length - 1]);

  const yLabels = [
    { value: max, y: yFor(max) },
    { value: (max + min) / 2, y: yFor((max + min) / 2) },
    { value: min, y: yFor(min) },
  ];
  const gridLines = yLabels.map(({ y }) => {
    return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="rgba(148,178,214,0.10)" stroke-dasharray="4 6" stroke-width="1" vector-effect="non-scaling-stroke"></line>`;
  }).join('');
  const yAxisLabels = yLabels.map(({ value, y }) => {
    return `<text x="${paddingX - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#7c8fa8" font-family="var(--font-num)">${value > 0 ? '+' : ''}${Math.round(value)}</text>`;
  }).join('');

  const firstAt = points[0]?.at ? formatShortDate(points[0].at) : '';
  const lastAt = points[points.length - 1]?.at ? formatShortDate(points[points.length - 1].at) : '';
  const xAxisLabels = `
    <text x="${paddingX}" y="${height - 6}" text-anchor="start" font-size="11" fill="#7c8fa8">${escapeHtml(firstAt)}</text>
    <text x="${width - paddingX}" y="${height - 6}" text-anchor="end" font-size="11" fill="#7c8fa8">${escapeHtml(lastAt)}</text>
  `;

  const dots = xs.map((x, index) => `<circle cx="${x}" cy="${yFor(values[index])}" r="2.5" fill="#9fd0ff" opacity="${index === values.length - 1 ? '0' : '.55'}" vector-effect="non-scaling-stroke"></circle>`).join('');

  const step = points.length > 1 ? chartWidth / (points.length - 1) : width;
  const hotspots = xs.map((x, index) => {
    const point = points[index];
    const left = index === 0 ? 0 : x - step / 2;
    const slice = index === 0 || index === xs.length - 1 ? step / 2 + paddingX / 2 : step;
    return `<rect class="curve-hit" x="${Math.max(0, left)}" y="0" width="${slice}" height="${height}"
      fill="transparent"
      data-curve-index="${index}"
      data-curve-x="${x}"
      data-curve-y="${yFor(values[index])}"
      data-curve-at="${escapeHtml(point.at || '')}"
      data-curve-result="${point.result}"
      data-curve-equity="${point.equity}"></rect>`;
  }).join('');

  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" class="curve-svg">
      <defs>
        <linearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.22"></stop>
          <stop offset="100%" stop-color="#58a6ff" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      ${gridLines}
      ${yAxisLabels}
      ${xAxisLabels}
      <line x1="${paddingX}" y1="${paddingY}" x2="${paddingX}" y2="${height - paddingY}" stroke="rgba(148,178,214,0.18)" stroke-width="1" vector-effect="non-scaling-stroke"></line>
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(148,178,214,0.18)" stroke-width="1" vector-effect="non-scaling-stroke"></line>
      <polygon points="${areaPoints}" fill="url(#curveFill)"></polygon>
      <polyline points="${polyline}" fill="none" stroke="#58a6ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke"></polyline>
      ${dots}
      <circle cx="${lastX}" cy="${lastY}" r="5" fill="#58a6ff" stroke="#d9f0ff" stroke-width="2" vector-effect="non-scaling-stroke"></circle>
      <line class="curve-cursor hidden" x1="0" y1="${paddingY}" x2="0" y2="${height - paddingY}"
            stroke="rgba(88,166,255,.5)" stroke-width="1" stroke-dasharray="3 4" vector-effect="non-scaling-stroke"></line>
      <circle class="curve-marker hidden" r="5" fill="#d9f0ff" stroke="#58a6ff" stroke-width="2" vector-effect="non-scaling-stroke"></circle>
      ${hotspots}
    </svg>
  `;
}

/**
 * Attaches hover inspection to a rendered curve.
 */
function bindCurveTooltip(containerSelector, unitLabel = '') {
  const container = $(containerSelector);
  if (!container) return;

  const svg = container.querySelector('.curve-svg');
  const tooltip = $('#curveTooltip');
  if (!svg || !tooltip) return;

  const cursor = svg.querySelector('.curve-cursor');
  const marker = svg.querySelector('.curve-marker');

  const hide = () => {
    tooltip.classList.add('hidden');
    cursor?.classList.add('hidden');
    marker?.classList.add('hidden');
  };

  svg.querySelectorAll('.curve-hit').forEach((hit) => {
    hit.addEventListener('mouseenter', () => {
      const x = Number(hit.dataset.curveX);
      const y = Number(hit.dataset.curveY);
      const result = Number(hit.dataset.curveResult) || 0;
      const equity = Number(hit.dataset.curveEquity) || 0;

      cursor?.setAttribute('x1', x);
      cursor?.setAttribute('x2', x);
      cursor?.classList.remove('hidden');
      marker?.setAttribute('cx', x);
      marker?.setAttribute('cy', y);
      marker?.classList.remove('hidden');

      tooltip.innerHTML = `
        <strong>${escapeHtml(formatDateTime(hit.dataset.curveAt) || t('ui.noValue'))}</strong>
        <span class="${result >= 0 ? 'value-good' : 'value-bad'}">
          ${result > 0 ? '+' : ''}${escapeHtml(formatNumber(result, 2))}${escapeHtml(unitLabel)}
        </span>
        <span class="curve-tooltip-equity">
          ${escapeHtml(t('analytics.curveEquity'))}: ${equity > 0 ? '+' : ''}${escapeHtml(formatNumber(equity, 2))}${escapeHtml(unitLabel)}
        </span>
      `;

      const bounds = container.getBoundingClientRect();
      const ratio = x / 920;
      const left = Math.min(Math.max(ratio * bounds.width, 70), bounds.width - 70);
      tooltip.style.insetInlineStart = `${left}px`;
      tooltip.style.top = `${(y / 260) * bounds.height}px`;
      tooltip.classList.remove('hidden');
    });
  });

  svg.addEventListener('mouseleave', hide);
}

function renderBreakdown(containerSelector, items, type = 'default') {
  const container = $(containerSelector);
  if (!container) return;
  if (!items.length) {
    container.innerHTML = emptyState(t('ui.empty.noData'));
    return;
  }

  if (type === 'backtest') {
    const maxSignals = Math.max(1, ...items.map((item) => item.totalSignals || 0));
    container.innerHTML = `
      <div class="table-list">
        ${items.map((item) => `
          <div class="item breakdown-card ${item.netResult >= 0 ? '' : 'bad'}">
            <div class="breakdown-head">
              <div>
                <div class="item-title">${escapeHtml(item.name)}</div>
                <div class="breakdown-meta">${escapeHtml(item.symbol || item.type || '')} · ${item.reviewed}/${item.totalSignals} ${escapeHtml(t('analytics.columns.reviewed'))}</div>
              </div>
              <div class="${classForSigned(item.netResult)}">${item.netResult > 0 ? '+' : ''}${formatNumber(item.netResult, 2)}R</div>
            </div>
            <div class="breakdown-bar"><i style="width:${Math.max(10, (item.totalSignals / maxSignals) * 100)}%"></i></div>
            <div class="breakdown-meta">${escapeHtml(t('analytics.columns.winRate'))} ${formatPercent(item.winRate, 1)} · ${escapeHtml(t('analytics.columns.avg'))} ${item.averageResult > 0 ? '+' : ''}${formatNumber(item.averageResult, 2)}</div>
          </div>
        `).join('')}
      </div>
    `;
    return;
  }

  const maxAbs = Math.max(1, ...items.slice(0, 8).map((item) => Math.abs(item.net)));
  container.innerHTML = `
    <div class="table-list">
      ${items.slice(0, 8).map((item) => `
        <div class="item breakdown-card ${item.net >= 0 ? '' : 'bad'}">
          <div class="breakdown-head">
            <div>
              <div class="item-title">${escapeHtml(item.label)}</div>
              <div class="breakdown-meta">${item.count} ${escapeHtml(t('analytics.tradesCount'))} · ${escapeHtml(t('analytics.winRateShort'))} ${formatPercent(item.winRate, 0)}</div>
            </div>
            <div class="${classForSigned(item.net)}">${item.net > 0 ? '+' : ''}${formatNumber(item.net, 2)}</div>
          </div>
          <div class="breakdown-bar"><i style="width:${Math.max(10, (Math.abs(item.net) / maxAbs) * 100)}%"></i></div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderHeatmap(cells) {
  const container = $('#analyticsHeatmap');
  if (!container) return;
  const sessions = ['London', 'New York', 'After'];
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  let html = `<div class="heat-label"></div>${sessions.map((session) => `<div class="heat-label">${escapeHtml(session)}</div>`).join('')}`;
  for (const day of days) {
    html += `<div class="heat-label">${escapeHtml(day)}</div>`;
    for (const session of sessions) {
      const cell = cells.find((item) => item.day === day && item.session === session) || { count: 0, net: 0 };
      const cls = cell.count === 0 ? 'neutral' : cell.net > 0 ? 'good' : cell.net < 0 ? 'bad' : 'neutral';
      html += `<div class="heat-cell ${cls}">${cell.count ? `${cell.net > 0 ? '+' : ''}${formatNumber(cell.net, 1)}<br><small>${cell.count}</small>` : '—'}</div>`;
    }
  }
  container.innerHTML = html;
}
