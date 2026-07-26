/**
 * Reusable render primitives shared by every page
 * (metric cards, empty states, list rows, charts, breakdowns, heatmap).
 */

function buildCurveSvg(points) {
  if (!points.length) return emptyState(t('analytics.emptyCurve'));
  const width = 920;
  const height = 240;
  const paddingX = 18;
  const paddingY = 24;
  const xs = points.map((_, index) => paddingX + index * ((width - paddingX * 2) / Math.max(1, points.length - 1)));
  const values = points.map((point) => point.equity);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const range = Math.max(1, max - min);
  const yFor = (value) => height - paddingY - ((value - min) / range) * (height - paddingY * 2);
  const polyline = values.map((value, index) => `${xs[index]},${yFor(value)}`).join(' ');
  const areaPoints = `${paddingX},${height - paddingY} ${polyline} ${width - paddingX},${height - paddingY}`;
  const lastX = xs[xs.length - 1];
  const lastY = yFor(values[values.length - 1]);
  const gridLines = [0.2, 0.4, 0.6, 0.8].map((ratio) => {
    const y = paddingY + ratio * (height - paddingY * 2);
    return `<line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="rgba(255,255,255,.06)" stroke-dasharray="4 6" stroke-width="1"></line>`;
  }).join('');
  const dots = xs.map((x, index) => `<circle cx="${x}" cy="${yFor(values[index])}" r="2.5" fill="#9fd0ff" opacity="${index === values.length - 1 ? '0' : '.65'}"></circle>`).join('');
  return `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id="curveFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="#58a6ff" stop-opacity="0.34"></stop>
          <stop offset="100%" stop-color="#58a6ff" stop-opacity="0"></stop>
        </linearGradient>
        <filter id="curveGlow">
          <feGaussianBlur stdDeviation="4" result="blur"></feGaussianBlur>
          <feMerge><feMergeNode in="blur"></feMergeNode><feMergeNode in="SourceGraphic"></feMergeNode></feMerge>
        </filter>
      </defs>
      ${gridLines}
      <line x1="${paddingX}" y1="${height - paddingY}" x2="${width - paddingX}" y2="${height - paddingY}" stroke="rgba(255,255,255,.09)" stroke-width="1"></line>
      <polygon points="${areaPoints}" fill="url(#curveFill)"></polygon>
      <polyline points="${polyline}" fill="none" stroke="#58a6ff" stroke-width="4" stroke-linejoin="round" stroke-linecap="round" filter="url(#curveGlow)"></polyline>
      ${dots}
      <circle cx="${lastX}" cy="${lastY}" r="6" fill="#58a6ff" stroke="#d9f0ff" stroke-width="2"></circle>
    </svg>
  `;
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
