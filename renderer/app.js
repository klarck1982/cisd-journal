const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const model = {
  state: null,
  bundle: null,
  accountId: null,
  dashboard: null,
  analytics: null,
  edge: null,
  fundingAccess: null,
  runtimeReadiness: null,
  page: 'overview',
  news: [],
  selectedBacktestId: null,
  newsConfigured: false,
  reasonSignalId: null,
  reasonPreset: 'hesitation',
  backtestReviewSignalId: null,
  backtestReviewStatus: 'WIN',
  journalPrefill: null,
  journalGuidanceMode: null,
  tradeCharts: { beforeImage: '', afterImage: '' },
  quickStartDismissed: false,
  busy: false,
  search: {
    signals: '',
    journal: '',
    backtest: '',
  },
  filters: {
    period: 'all',
    source: 'all',
    instrument: 'all',
    side: 'all',
    session: 'all',
  },
};

function t(path, vars = {}) {
  const parts = path.split('.');
  let value = model.bundle;
  for (const part of parts) value = value?.[part];
  if (typeof value !== 'string') return path;
  return value.replace(/\{\{(\w+)\}\}/g, (_, key) => String(vars[key] ?? ''));
}

function localeCode() {
  return model.state?.settings?.locale === 'en' ? 'en-US' : 'ar';
}

function persistUiState() {
  try {
    localStorage.setItem('cisd-ui-state', JSON.stringify({
      page: model.page,
      accountId: model.accountId,
      selectedBacktestId: model.selectedBacktestId,
      filters: model.filters,
      search: model.search,
      quickStartDismissed: model.quickStartDismissed,
    }));
  } catch {}
}

function restoreUiState() {
  try {
    const raw = localStorage.getItem('cisd-ui-state');
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (saved.page) model.page = saved.page;
    if (saved.accountId) model.accountId = saved.accountId;
    if (saved.selectedBacktestId) model.selectedBacktestId = saved.selectedBacktestId;
    if (saved.filters) model.filters = { ...model.filters, ...saved.filters };
    if (saved.search) model.search = { ...model.search, ...saved.search };
    if (saved.quickStartDismissed) model.quickStartDismissed = true;
  } catch {}
}

function setBusy(isBusy, message = '') {
  model.busy = isBusy;
  const overlay = $('#appLoading');
  if (!overlay) return;
  overlay.classList.toggle('hidden', !isBusy);
  $('#loadingText').textContent = message || t('ui.loading');
}

async function runBusy(message, task) {
  try {
    setBusy(true, message);
    return await task();
  } finally {
    setBusy(false);
  }
}

function openConfirm({ title, text, confirmLabel, typeToConfirm = '' }) {
  return new Promise((resolve) => {
    const modal = $('#confirmModal');
    const input = $('#confirmModalTypeInput');
    const accept = $('#acceptConfirmModal');

    $('#confirmModalTitle').textContent = title || t('confirmModal.defaultTitle');
    $('#confirmModalText').textContent = text || '';
    $('#cancelConfirmModal').textContent = t('ui.cancel');
    accept.textContent = confirmLabel || t('confirmModal.confirm');

    $('#confirmModalTypeWrap').classList.toggle('hidden', !typeToConfirm);
    $('#confirmModalTypeLabel').textContent = typeToConfirm ? t('confirmModal.typeToConfirm', { word: typeToConfirm }) : '';
    input.value = '';
    accept.disabled = !!typeToConfirm;

    const validate = () => {
      accept.disabled = input.value.trim().toUpperCase() !== typeToConfirm.toUpperCase();
    };

    const cleanup = (result) => {
      modal.classList.add('hidden');
      input.removeEventListener('input', validate);
      document.removeEventListener('keydown', onKey);
      accept.onclick = null;
      $('#cancelConfirmModal').onclick = null;
      $('#closeConfirmModal').onclick = null;
      modal.onclick = null;
      resolve(result);
    };

    const onKey = (event) => {
      if (event.key === 'Escape') cleanup(false);
    };

    if (typeToConfirm) input.addEventListener('input', validate);
    document.addEventListener('keydown', onKey);
    accept.onclick = () => cleanup(true);
    $('#cancelConfirmModal').onclick = () => cleanup(false);
    $('#closeConfirmModal').onclick = () => cleanup(false);
    modal.onclick = (event) => {
      if (event.target.id === 'confirmModal') cleanup(false);
    };

    modal.classList.remove('hidden');
    (typeToConfirm ? input : accept).focus();
  });
}

function activeAccount() {
  const accounts = visibleAccounts();
  return accounts.find((account) => account.id === model.accountId) || accounts[0] || null;
}

function visibleAccounts() {
  return (model.state?.accounts || []).filter((account) => !account.archived);
}

function ensureAccount() {
  const current = activeAccount();
  if (current) {
    model.accountId = current.id;
    return current;
  }
  model.accountId = null;
  return null;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function todayKey() {
  // Trading day in the configured timezone (prop-firm limits reset on the trading day,
  // not on the UTC day).
  const zone = model.state?.settings?.timezone || 'America/New_York';
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function formatCurrency(value, currency) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat(localeCode(), {
    style: 'currency',
    currency: currency || 'USD',
    maximumFractionDigits: 0,
  }).format(number);
}

function formatNumber(value, digits = 2) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return new Intl.NumberFormat(localeCode(), {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(number);
}

function formatPercent(value, digits = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '—';
  return `${formatNumber(number * 100, digits)}%`;
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeCode(), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: model.state?.settings?.timezone || 'America/New_York',
  }).format(date);
}

function formatShortDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat(localeCode(), {
    month: 'short',
    day: 'numeric',
    timeZone: model.state?.settings?.timezone || 'America/New_York',
  }).format(date);
}

function zonedTimeParts(timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    weekday: 'short',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.filter((part) => part.type !== 'literal').map((part) => [part.type, part.value]));
  return map;
}

function currentSessionLabel() {
  const zone = model.state?.settings?.timezone || 'America/New_York';
  const hour = Number(zonedTimeParts(zone).hour || 0);
  if (hour < 8) return t('session.london');
  if (hour < 17) return t('session.newYork');
  return t('session.afterHours');
}

function toast(message, kind = 'info') {
  const el = $('#toast');
  if (!el) return;
  el.textContent = message;
  el.dataset.kind = kind;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2600);
}

function pulseElement(selector) {
  const el = typeof selector === 'string' ? $(selector) : selector;
  if (!el) return;
  el.classList.remove('flash-surface');
  void el.offsetWidth;
  el.classList.add('flash-surface');
  clearTimeout(el._pulseTimer);
  el._pulseTimer = setTimeout(() => el.classList.remove('flash-surface'), 850);
}

function pulseActivePage() {
  pulseElement(document.querySelector(`.page[data-page="${model.page}"]`));
}

function classForSigned(value) {
  const number = Number(value) || 0;
  if (number > 0) return 'value-good';
  if (number < 0) return 'value-bad';
  return 'value-muted';
}

function riskChip(state) {
  if (state === 'SAFE') return { cls: 'safe', label: t('ui.status.safe') };
  if (state === 'BREACH') return { cls: 'bad', label: t('ui.status.breach') };
  return { cls: 'warn', label: t('ui.status.attention') };
}

function signalDisplayState(signal) {
  const account = activeAccount();
  const decision = signal.mode === 'BACKTEST'
    ? (signal.status && signal.status !== 'NEW' ? { status: 'EXECUTED', outcome: signal.status } : null)
    : signal.decisions?.[account?.id];

  const status = String(decision?.status || 'NEW').toUpperCase();
  if (status === 'MISSED') return { key: 'missed', cls: 'bad', label: t('signals.status.missed'), decision };
  if (['ORDER_PLACED', 'EXECUTED', 'ENTERED', 'FILLED', 'TAKEN'].includes(status)) return { key: 'executed', cls: 'safe', label: t('signals.status.executed'), decision };
  return { key: 'pending', cls: 'warn', label: t('signals.status.pending'), decision: null };
}

function iconSvg(name) {
  const icons = {
    overview: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5"/></svg>',
    signals: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 12h4l2-5 4 10 2-5h4"/></svg>',
    journal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h10l4 4v14H6z"/><path d="M16 3v5h5"/><path d="M9 12h6M9 16h6"/></svg>',
    backtest: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="8"/></svg>',
    analytics: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19h16"/><path d="M7 16V9"/><path d="M12 16V5"/><path d="M17 16v-3"/></svg>',
    data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6"/><path d="M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1"/><circle cx="12" cy="12" r="4"/></svg>',
    capital: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="6" width="18" height="12" rx="3"/><path d="M15 12h.01"/><path d="M7 12h4"/></svg>',
    balance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16v10H4z"/><path d="M4 10h16"/></svg>',
    equity: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 14h4l2-4 4 8 2-4h4"/></svg>',
    position: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 19V5"/><path d="M5 6h11l-2 4 2 4H5"/></svg>',
    risk: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4 7v5c0 5 3.4 8.7 8 9 4.6-.3 8-4 8-9V7l-8-4Z"/><path d="M12 8v5"/><path d="M12 16h.01"/></svg>',
    discipline: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 12 3 3 7-7"/><circle cx="12" cy="12" r="9"/></svg>',
    challenge: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 4h10v4a5 5 0 0 1-10 0V4Z"/><path d="M8 20h8"/><path d="M12 13v7"/></svg>',
    news: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 6h11a3 3 0 0 1 3 3v9H8a3 3 0 0 0-3 3V6Z"/><path d="M8 18V6"/><path d="M10 10h6M10 13h6"/></svg>',
    filter: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 6h16l-6 7v5l-4 2v-7L4 6Z"/></svg>',
    curve: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 18h16"/><path d="m5 15 4-4 4 2 6-7"/></svg>',
    compare: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 5h4v14H7zM13 9h4v10h-4z"/></svg>',
    source: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h6v6H5zM13 13h6v6h-6zM13 5h6v6h-6zM5 13h6v6H5z"/></svg>',
    session: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2v5M12 17v5M4.9 4.9l3.5 3.5M15.6 15.6l3.5 3.5"/><circle cx="12" cy="12" r="4"/></svg>',
    side: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m7 17 5-10 5 10"/><path d="M7 17h10"/></svg>',
    instrument: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 17 17 4"/><path d="m14 4 6 6"/><path d="m4 14 6 6"/></svg>',
    tag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12 12 3h8v8l-9 9L3 12Z"/><circle cx="17" cy="7" r="1"/></svg>',
    month: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    heatmap: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 5h4v4H5zM10 5h4v4h-4zM15 5h4v4h-4zM5 10h4v4H5zM10 10h4v4h-4zM15 10h4v4h-4zM5 15h4v4H5zM10 15h4v4h-4zM15 15h4v4h-4z"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="14" rx="3"/><path d="m7 10 2 2-2 2M11 14h5"/></svg>',
    language: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h8M8 5c0 8-4 12-4 12"/><path d="M8 5c0 3 2 6 4 8"/><path d="M14 16h6M17 13l3 8M17 13l-3 8"/></svg>',
    maintenance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m14 7 3-3 3 3-8 8H9v-3l5-5Z"/><path d="M5 19h14"/></svg>',
    import: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v10"/><path d="m8 10 4 4 4-4"/><path d="M5 19h14"/></svg>',
    link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10 14 8 16a3 3 0 1 1-4-4l2-2"/><path d="m14 10 2-2a3 3 0 1 1 4 4l-2 2"/><path d="M9 15 15 9"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.2 6.4 20.2l1.1-6.2L3 9.6l6.2-.9L12 3Z"/></svg>'
  };
  return icons[name] || icons.star;
}

function icon(name, cls = 'icon-inline') {
  return `<span class="${cls}" aria-hidden="true">${iconSvg(name)}</span>`;
}

function iconText(name, text, cls = 'title-with-icon', iconCls = cls === 'nav-content' ? 'nav-icon' : 'icon-inline') {
  return `<span class="${cls}">${icon(name, iconCls)}<span>${escapeHtml(text)}</span></span>`;
}

function metricCard(label, value, hint = '', tone = '', iconName = 'star') {
  return `
    <article class="metric-card ${tone}">
      <div class="metric-card-head">
        ${icon(iconName, 'metric-icon')}
        <small>${escapeHtml(label)}</small>
      </div>
      <strong>${escapeHtml(value)}</strong>
      <div class="mini">${escapeHtml(hint)}</div>
    </article>
  `;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHtml(text)}</div>`;
}

function navLabelForPage(page) {
  const map = {
    overview: t('nav.overview'),
    signals: t('nav.signals'),
    journal: t('nav.journal'),
    backtest: t('nav.backtest'),
    edge: t('nav.edge'),
    analytics: t('nav.analytics'),
    data: t('nav.data'),
    settings: t('nav.settings'),
  };
  return map[page] || page;
}

function renderWorkspaceStatus() {
  const account = activeAccount();
  $('#statusAccountLabel').textContent = t('workspace.account');
  $('#statusPageLabel').textContent = t('workspace.page');
  $('#statusLocaleLabel').textContent = t('workspace.language');
  $('#statusSyncLabel').textContent = t('workspace.lastSignalSync');
  $('#statusAccountValue').textContent = account ? `${account.firm} · ${account.name || account.phase || ''}` : t('ui.noValue');
  $('#statusPageValue').textContent = navLabelForPage(model.page);
  $('#statusLocaleValue').textContent = model.state?.settings?.locale === 'en' ? 'English · LTR' : 'العربية · RTL';
  $('#statusSyncValue').textContent = model.state?.settings?.lastSignalSync ? formatDateTime(model.state.settings.lastSignalSync) : t('workspace.notSynced');
}

function renderListRows(items, formatter) {
  return items.length ? items.map(formatter).join('') : emptyState(t('ui.empty.noData'));
}

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

function applyStaticText() {
  document.documentElement.lang = model.state?.settings?.locale || 'ar';
  document.documentElement.dir = model.bundle?.meta?.dir || 'rtl';
  document.title = t('app.title');

  $('#appTitle').textContent = t('app.title');
  $('#appSubtitle').textContent = t('app.subtitle');
  $('#accountsKicker').textContent = t('app.accounts');
  $('#newAccountBtn').innerHTML = `${icon('star','button-icon')}${escapeHtml(t('app.newChallenge'))}`;
  $('#navOverview').innerHTML = iconText('overview', t('nav.overview'), 'nav-content');
  $('#navSignals').innerHTML = iconText('signals', t('nav.signals'), 'nav-content');
  $('#navJournal').innerHTML = iconText('journal', t('nav.journal'), 'nav-content');
  $('#navBacktest').innerHTML = iconText('backtest', t('nav.backtest'), 'nav-content');
  $('#navEdge').innerHTML = iconText('discipline', t('nav.edge'), 'nav-content');
  $('#navAnalytics').innerHTML = iconText('analytics', t('nav.analytics'), 'nav-content');
  $('#navData').innerHTML = iconText('data', t('nav.data'), 'nav-content');
  $('#navSettings').innerHTML = iconText('settings', t('nav.settings'), 'nav-content');
  $('#sidebarFooter').textContent = t('app.footer');

  $('#overviewKicker').textContent = t('overview.kicker');
  $('#overviewTitle').textContent = t('overview.title');
  $('#overviewDescription').textContent = t('overview.description');
  $('#overviewOpenTerminal').innerHTML = `${icon('terminal','button-icon')}${escapeHtml(t('overview.actions.openTerminal'))}`;
  $('#overviewLoadNews').innerHTML = `${icon('news','button-icon')}${escapeHtml(t('overview.actions.refreshNews'))}`;
  $('#overviewGoSignals').innerHTML = `${icon('signals','button-icon')}${escapeHtml(t('overview.actions.reviewSignals'))}`;
  $('#overviewHealthTitle').innerHTML = iconText('balance', t('overview.health.title'));
  $('#overviewRiskTitle').innerHTML = iconText('risk', t('overview.risk.title'));
  $('#overviewDisciplineTitle').innerHTML = iconText('discipline', t('overview.discipline.title'));
  $('#overviewChallengeTitle').innerHTML = iconText('challenge', t('overview.challenge.title'));
  $('#overviewNewsTitle').innerHTML = iconText('news', t('overview.news.title'));
  $('#overviewSignalsTitle').innerHTML = iconText('signals', t('overview.latestSignals.title'));
  $('#overviewSignalsHint').textContent = t('overview.latestSignals.hint');

  $('#signalsKicker').textContent = t('signals.kicker');
  $('#signalsTitle').textContent = t('signals.title');
  $('#signalsDescription').textContent = t('signals.description');
  $('#chooseCsvBtn').innerHTML = `${icon('import','button-icon')}${escapeHtml(t('signals.actions.chooseCsv'))}`;
  $('#refreshSnapshotsBtn').innerHTML = `${icon('source','button-icon')}${escapeHtml(t('signals.actions.refresh'))}`;
  $('#signalsSourceTitle').innerHTML = iconText('source', t('signals.sourceTitle'));
  $('#signalsSummaryTitle').innerHTML = iconText('discipline', t('signals.summaryTitle'));
  $('#signalsSummaryHint').textContent = t('signals.summaryHint');
  $('#signalsLiveTitle').innerHTML = iconText('signals', t('signals.liveTitle'));
  $('#signalsLiveHint').textContent = t('signals.liveHint');
  $('#signalsSearch').placeholder = t('signals.searchPlaceholder');

  $('#journalKicker').textContent = t('journal.kicker');
  $('#journalTitle').textContent = t('journal.title');
  $('#journalDescription').textContent = t('journal.description');
  $('#tradeFormTitle').innerHTML = iconText('journal', t('journal.form.title'));
  $('#tradeFormHint').textContent = t('journal.form.hint');
  $('#tradeSignalLabel').textContent = t('journal.form.signal');
  $('#tradeSourceLabel').textContent = t('journal.form.source');
  $('#tradeSymbolLabel').textContent = t('journal.form.symbol');
  $('#tradeSideLabel').textContent = t('journal.form.side');
  $('#tradeDateLabel').textContent = t('journal.form.date');
  $('#tradeResultLabel').textContent = t('journal.form.resultR');
  $('#tradeTagsLabel').textContent = t('journal.form.tags');
  $('#tradeNoteLabel').textContent = t('journal.form.note');
  $('#saveTradeBtn').innerHTML = `${icon('journal','button-icon')}${escapeHtml(t('journal.form.save'))}`;
  $('#recentTradesTitle').innerHTML = iconText('journal', t('journal.recentTrades.title'));
  $('#exportTradesBtn').innerHTML = `${icon('import', 'button-icon')}${escapeHtml(t('journal.export'))}`;
  $('#tradeChartsTitle').textContent = t('journal.charts.title');
  $('#tradeChartBeforeLabel').textContent = t('journal.charts.before');
  $('#tradeChartAfterLabel').textContent = t('journal.charts.after');
  $('#tradeChartBeforeBtn').textContent = t('journal.charts.choose');
  $('#tradeChartAfterBtn').textContent = t('journal.charts.choose');
  $('#tradeChartBeforeClear').textContent = t('journal.charts.remove');
  $('#tradeChartAfterClear').textContent = t('journal.charts.remove');
  $('#journalSearch').placeholder = t('journal.searchPlaceholder');
  $('#journalGuidanceBackBtn').textContent = t('journal.guidance.backToSignals');
  $('#journalGuidanceClearBtn').textContent = t('journal.guidance.clear');

  $('#backtestKicker').textContent = t('backtest.kicker');
  $('#backtestTitle').textContent = t('backtest.title');
  $('#backtestDescription').textContent = t('backtest.description');
  $('#backtestCreateTitle').innerHTML = iconText('backtest', t('backtest.create.title'));
  $('#backtestCreateHint').textContent = t('backtest.create.hint');
  $('#backtestNameLabel').textContent = t('backtest.create.name');
  $('#backtestSessionLabel').textContent = t('backtest.create.session');
  $('#backtestStartLabel').textContent = t('backtest.create.start');
  $('#backtestEndLabel').textContent = t('backtest.create.end');
  $('#backtestSymbolLabel').textContent = t('backtest.create.symbol');
  $('#backtestTfLabel').textContent = t('backtest.create.tf');
  $('#backtestStartBtn').innerHTML = `${icon('backtest','button-icon')}${escapeHtml(t('backtest.create.save'))}`;
  $('#backtestLibraryTitle').innerHTML = iconText('backtest', t('backtest.library.title'));
  $('#backtestLibraryHint').textContent = t('backtest.library.hint');
  $('#backtestReviewTitle').innerHTML = iconText('signals', t('backtest.review.title'));
  $('#backtestReviewHint').textContent = t('backtest.review.hint');
  $('#backtestSearch').placeholder = t('backtest.searchPlaceholder');

  $('#analyticsKicker').textContent = t('analytics.kicker');
  $('#analyticsTitle').textContent = t('analytics.title');
  $('#analyticsDescription').textContent = t('analytics.description');
  $('#analyticsFilterTitle').innerHTML = iconText('filter', t('analytics.filterTitle'));
  $('#analyticsFilterHint').textContent = t('analytics.filterHint');
  $('#analyticsSummaryTitle').innerHTML = iconText('analytics', t('analytics.summaryTitle'));
  $('#analyticsSummaryHint').textContent = t('analytics.summaryHint');
  $('#analyticsCurveTitle').innerHTML = iconText('curve', t('analytics.curveTitle'));
  $('#analyticsCurveHint').textContent = t('analytics.curveHint');
  $('#analyticsBacktestTitle').innerHTML = iconText('compare', t('analytics.backtestTitle'));
  $('#analyticsBacktestHint').textContent = t('analytics.backtestHint');
  $('#analyticsSourceTitle').innerHTML = iconText('source', t('analytics.breakdowns.source'));
  $('#analyticsSessionTitle').innerHTML = iconText('session', t('analytics.breakdowns.session'));
  $('#analyticsSideTitle').innerHTML = iconText('side', t('analytics.breakdowns.side'));
  $('#analyticsInstrumentTitle').innerHTML = iconText('instrument', t('analytics.breakdowns.instrument'));
  $('#analyticsTagTitle').innerHTML = iconText('tag', t('analytics.breakdowns.tag'));
  $('#analyticsMonthTitle').innerHTML = iconText('month', t('analytics.breakdowns.month'));
  $('#analyticsHeatmapTitle').innerHTML = iconText('heatmap', t('analytics.heatmapTitle'));
  $('#analyticsHeatmapHint').textContent = t('analytics.heatmapHint');

  $('#dataKicker').textContent = t('data.kicker');
  $('#dataTitle').textContent = t('data.title');
  $('#dataDescription').textContent = t('data.description');
  $('#importMt5Btn').innerHTML = `${icon('import','button-icon')}${escapeHtml(t('data.actions.importMt5'))}`;
  $('#importFundedNextBtn').innerHTML = `${icon('import','button-icon')}${escapeHtml(t('data.actions.importFundedNext'))}`;
  $('#watchFundedNextBtn').innerHTML = `${icon('source','button-icon')}${escapeHtml(t('data.actions.watchFolder'))}`;
  $('#dataSourcesTitle').innerHTML = iconText('source', t('data.sourcesTitle'));
  $('#dataImportsTitle').innerHTML = iconText('import', t('data.importsTitle'));
  $('#dataImportsHint').textContent = t('data.importsHint');

  $('#settingsKicker').textContent = t('settings.kicker');
  $('#settingsTitle').textContent = t('settings.title');
  $('#settingsDescription').textContent = t('settings.description');
  $('#accountSettingsTitle').innerHTML = iconText('risk', t('settings.accountTitle'));
  $('#accountFirmLabel').textContent = t('settings.accountFields.firm');
  $('#accountNameLabel').textContent = t('settings.accountFields.name');
  $('#accountCapitalLabel').textContent = t('settings.accountFields.capital');
  $('#accountBalanceLabel').textContent = t('settings.accountFields.balance');
  $('#accountCurrencyLabel').textContent = t('settings.accountFields.currency');
  $('#accountPhaseLabel').textContent = t('settings.accountFields.phase');
  $('#accountTargetLabel').textContent = t('settings.accountFields.target');
  $('#accountDailyLossLabel').textContent = t('settings.accountFields.dailyLoss');
  $('#accountMaxDrawdownLabel').textContent = t('settings.accountFields.maxDrawdown');
  $('#saveAccountSettingsBtn').innerHTML = `${icon('risk','button-icon')}${escapeHtml(t('settings.accountSave'))}`;
  $('#fundingAccessTitle').innerHTML = iconText('source', t('funding.title'));
  $('#fundingAccessDescription').textContent = t('funding.description');
  $('#fundingAccessModeLabel').textContent = t('funding.modeLabel');
  $('#fundingSyncScopeLabel').textContent = t('funding.syncScopeLabel');
  $('#investorLoginLabel').textContent = t('funding.investorLogin');
  $('#investorServerLabel').textContent = t('funding.investorServer');
  $('#investorPasswordLabel').textContent = t('funding.investorPassword');
  $('#sharedUrlLabel').textContent = t('funding.sharedUrl');
  $('#fundingAccessModeInput').innerHTML = `
    <option value="none">${escapeHtml(t('funding.modes.none'))}</option>
    <option value="investor_pass">${escapeHtml(t('funding.modes.investor'))}</option>
    <option value="shared_url">${escapeHtml(t('funding.modes.sharedUrl'))}</option>
  `;
  $('#fundingSyncScopeInput').innerHTML = `
    <option value="account_health_only">${escapeHtml(t('funding.scopes.healthOnly'))}</option>
    <option value="account_and_open_positions">${escapeHtml(t('funding.scopes.healthAndOpen'))}</option>
    <option value="full_readonly">${escapeHtml(t('funding.scopes.fullReadonly'))}</option>
  `;
  $('#saveFundingAccessBtn').innerHTML = `${icon('source','button-icon')}${escapeHtml(t('funding.save'))}`;
  $('#syncFundingAccessBtn').innerHTML = `${icon('import','button-icon')}${escapeHtml(t('funding.sync'))}`;
  $('#openFundingAccessBtn').innerHTML = `${icon('link','button-icon')}${escapeHtml(t('funding.open'))}`;
  $('#preferencesTitle').innerHTML = iconText('settings', t('settings.preferencesTitle'));
  $('#settingsLanguageLabel').textContent = t('settings.language');
  $('#settingsTimezoneLabel').textContent = t('settings.timezone');
  $('#settingsNotificationsLabel').textContent = t('settings.notifications');
  $('#savePreferencesBtn').innerHTML = `${icon('settings','button-icon')}${escapeHtml(t('settings.save'))}`;
  $('#terminalTitle').innerHTML = iconText('terminal', t('settings.terminalTitle'));
  $('#terminalDescription').textContent = t('settings.terminalDescription');
  $('#chooseTerminalBtn').innerHTML = `${icon('terminal','button-icon')}${escapeHtml(t('settings.chooseTerminal'))}`;
  $('#openTerminalBtn').innerHTML = `${icon('terminal','button-icon')}${escapeHtml(t('settings.openTerminal'))}`;
  $('#newsSettingsTitle').innerHTML = iconText('news', t('settings.newsTitle'));
  $('#newsProviderLabel').textContent = t('settings.newsProvider');
  $('#newsKeyLabel').textContent = t('settings.newsKey');
  $('#saveNewsSettingsBtn').innerHTML = `${icon('news','button-icon')}${escapeHtml(t('settings.saveNews'))}`;
  $('#testNewsBtn').innerHTML = `${icon('news','button-icon')}${escapeHtml(t('settings.testNews'))}`;
  $('#maintenanceTitle').innerHTML = iconText('maintenance', t('settings.maintenanceTitle'));
  $('#backupBtn').innerHTML = `${icon('import','button-icon')}${escapeHtml(t('settings.backup'))}`;
  $('#restoreBtn').innerHTML = `${icon('import','button-icon')}${escapeHtml(t('settings.restore'))}`;
  $('#openGuideBtn').innerHTML = `${icon('journal','button-icon')}${escapeHtml(t('settings.guide'))}`;
  $('#restartOnboardingBtn').innerHTML = `${icon('settings','button-icon')}${escapeHtml(t('settings.restartOnboarding'))}`;
  $('#edgeKicker').textContent = t('edge.kicker');
  $('#edgeTitle').textContent = t('edge.title');
  $('#edgeDescription').textContent = t('edge.description');
  $('#edgeScoreLabel').textContent = t('edge.scoreTitle');
  $('#edgeHesitationKicker').textContent = t('edge.hesitationTitle');
  $('#edgeReasonsTitle').textContent = t('edge.reasonsTitle');
  $('#edgeReasonsHint').textContent = t('edge.reasonsHint');
  $('#edgePotentialTitle').textContent = t('edge.potentialTitle');
  $('#edgePotentialHint').textContent = t('edge.potentialHint');
  $('#edgeStatsTitle').textContent = t('edge.statsTitle');
  $('#edgeDistributionTitle').textContent = t('edge.distributionTitle');
  $('#edgeDistributionHint').textContent = t('edge.distributionHint');
  $('#edgeScoreTitle').textContent = t('edge.scoreTitle');
  $('#edgeScoreHint').textContent = t('edge.scoreHint');
  $('#edgeInsightsTitle').textContent = t('edge.insightsTitle');
  $('#quickStartTitle').textContent = t('overview.quickStart.title');
  $('#quickStartDescription').textContent = t('overview.quickStart.description');
  $('#quickStartDismiss').textContent = t('overview.quickStart.dismiss');
  $('#dangerZoneTitle').textContent = t('settings.dangerTitle');
  $('#dangerZoneDescription').textContent = t('settings.dangerDescription');
  $('#resetAccountBtn').innerHTML = `${icon('risk','button-icon')}${escapeHtml(t('settings.resetAccount'))}`;

  $('#accountModalTitle').textContent = t('accountModal.title');
  $('#accountModalDescription').textContent = t('accountModal.description');
  $('#accountModalFirmLabel').textContent = t('accountModal.firm');
  $('#accountModalNameLabel').textContent = t('accountModal.name');
  $('#accountModalCapitalLabel').textContent = t('accountModal.capital');
  $('#accountModalCurrencyLabel').textContent = t('accountModal.currency');
  $('#accountModalPhaseLabel').textContent = t('accountModal.phase');
  $('#accountModalTargetLabel').textContent = t('accountModal.target');
  $('#accountModalDailyLossLabel').textContent = t('accountModal.dailyLoss');
  $('#accountModalDrawdownLabel').textContent = t('accountModal.maxDrawdown');
  $('#accountModalFirm').placeholder = t('accountModal.firmPlaceholder');
  $('#accountModalName').placeholder = t('accountModal.namePlaceholder');
  $('#cancelAccountModal').textContent = t('ui.cancel');
  $('#submitAccountModal').textContent = t('accountModal.submit');

  $('#reasonModalTitle').textContent = t('signals.reasonModal.title');
  $('#reasonModalDescription').textContent = t('signals.reasonModal.description');
  $('#reasonNoteLabel').textContent = t('signals.reasonModal.note');
  $('#saveReasonBtn').textContent = t('signals.reasonModal.save');

  $('#backtestReviewModalTitle').textContent = t('backtest.review.modalTitle');
  $('#backtestReviewModalDescription').textContent = t('backtest.review.modalDescription');
  $('#backtestReviewStatusLabel').textContent = t('backtest.review.statusLabel');
  $('#backtestReviewResultLabel').textContent = t('backtest.review.resultLabel');
  $('#backtestReviewNoteLabel').textContent = t('backtest.review.noteLabel');
  $('#saveBacktestReviewBtn').textContent = t('backtest.review.save');
  $('#backtestReviewResultInput').placeholder = t('backtest.review.resultPlaceholder');
  $('#backtestReviewNoteInput').placeholder = t('backtest.review.notePlaceholder');
}

function renderAccounts() {
  const currentDashboard = model.dashboard;
  $('#overviewAccountLabel').textContent = activeAccount()?.firm || '—';
  $('#accountRail').innerHTML = renderListRows(visibleAccounts(), (account) => {
    const isActive = account.id === model.accountId;
    const tone = isActive ? 'active' : '';
    const balance = formatCurrency(account.currentBalance || 0, account.currency || 'USD');
    const capital = account.capital ? formatCurrency(account.capital, account.currency || 'USD') : t('ui.noValue');
    const riskState = isActive && currentDashboard ? riskChip(currentDashboard.risk.state) : { cls: 'neutral', label: account.phase || '—' };
    return `
      <button class="account-card ${tone}" data-account-id="${escapeHtml(account.id)}">
        <div class="account-top">
          <div>
            <div class="account-name">${escapeHtml(account.firm || t('ui.unknown'))}</div>
            <div class="account-meta">${escapeHtml(account.name || '')}</div>
          </div>
          <span class="mini-chip">${escapeHtml(account.phase || 'Challenge')}</span>
        </div>
        <div class="account-stats">
          <span class="mini-chip">${escapeHtml(t('overview.health.capital'))}: ${escapeHtml(capital)}</span>
          <span class="mini-chip">${escapeHtml(t('overview.health.balance'))}: ${escapeHtml(balance)}</span>
          <span class="mini-chip ${riskState.cls}">${escapeHtml(riskState.label)}</span>
        </div>
      </button>
    `;
  });

  $$('.account-card').forEach((button) => {
    button.onclick = async () => {
      model.accountId = button.dataset.accountId;
      persistUiState();
      await refreshFundingAccess();
      await refreshSnapshots();
      render();
    };
  });
}

function renderOverviewHero(account, dashboard) {
  const zone = model.state?.settings?.timezone || 'America/New_York';
  const now = new Date();
  const nextNews = model.news[0] || null;
  const insightTone = dashboard.risk.state === 'BREACH' ? 'bad' : dashboard.discipline.score >= 70 ? 'good' : dashboard.discipline.score >= 40 ? 'warn' : 'bad';
  const insightText = dashboard.risk.state === 'BREACH'
    ? t('overview.hero.insightBreach')
    : dashboard.discipline.totals.missed > 0
      ? t('overview.hero.insightMissed', { count: dashboard.discipline.totals.missed })
      : t('overview.hero.insightStable');

  $('#overviewHeroKicker').textContent = t('overview.hero.kicker');
  $('#overviewHeroTitle').textContent = account.name || account.firm || t('ui.unknown');
  $('#overviewHeroText').textContent = t('overview.hero.description');
  $('#overviewHeroTimeLabel').textContent = `${new Intl.DateTimeFormat(localeCode(), { weekday: 'long', timeZone: zone }).format(now)} · ${zone}`;
  $('#overviewHeroTimeValue').textContent = new Intl.DateTimeFormat(localeCode(), { hour: '2-digit', minute: '2-digit', timeZone: zone }).format(now);
  $('#overviewHeroSessionValue').textContent = currentSessionLabel();
  $('#overviewHeroTags').innerHTML = [
    `<span class="tag ${dashboard.risk.state === 'SAFE' ? 'safe' : dashboard.risk.state === 'ATTENTION' ? 'warn' : 'bad'}">${escapeHtml(t('overview.hero.risk'))}: ${escapeHtml(riskChip(dashboard.risk.state).label)}</span>`,
    `<span class="tag ${dashboard.discipline.score >= 70 ? 'safe' : dashboard.discipline.score >= 40 ? 'warn' : 'bad'}">${escapeHtml(t('overview.hero.discipline'))}: ${escapeHtml(formatNumber(dashboard.discipline.score, 0))}</span>`,
    `<span class="tag blue">${escapeHtml(t('overview.hero.challenge'))}: ${escapeHtml(formatPercent(dashboard.risk.challenge.progressClamped ?? 0))}</span>`,
    nextNews ? `<span class="tag warn">${escapeHtml(t('overview.hero.nextNews'))}: ${escapeHtml(nextNews.Country || nextNews.country || '')} · ${escapeHtml(formatShortDate(nextNews.Date || nextNews.date || ''))}</span>` : `<span class="tag neutral">${escapeHtml(t('overview.hero.noNews'))}</span>`,
  ].join('');
  $('#overviewHeroInsight').className = `hero-insight ${insightTone}`;
  $('#overviewHeroInsight').innerHTML = `
    <strong>${escapeHtml(t('overview.hero.insightTitle'))}</strong>
    <p>${escapeHtml(insightText)}</p>
    <div class="hero-insight-meta">${escapeHtml(t('overview.hero.pending'))}: ${dashboard.discipline.totals.pending} · ${escapeHtml(t('overview.hero.reviewed'))}: ${dashboard.discipline.totals.decided}</div>
  `;
}

function renderQuickStart() {
  const panel = $('#quickStartPanel');
  const account = activeAccount();

  if (model.quickStartDismissed || !account) {
    panel.classList.add('hidden');
    return;
  }

  const steps = [
    {
      done: Number(account.capital) > 0 && Number(account.dailyLoss) > 0 && Number(account.maxDrawdown) > 0,
      label: t('overview.quickStart.capital'),
      action: t('overview.quickStart.capitalAction'),
      go: 'settings',
    },
    {
      done: !!model.state?.settings?.csvPath,
      label: t('overview.quickStart.csv'),
      action: t('overview.quickStart.csvAction'),
      go: 'csv',
    },
    {
      done: !!model.newsConfigured,
      label: t('overview.quickStart.news'),
      action: t('overview.quickStart.newsAction'),
      go: 'settings',
    },
  ];

  if (steps.every((step) => step.done)) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  $('#quickStartSteps').innerHTML = steps.map((step, index) => `
    <div class="quick-step ${step.done ? 'done' : ''}">
      <span class="quick-step-index">${step.done ? '✓' : index + 1}</span>
      <span class="quick-step-label">${escapeHtml(step.label)}</span>
      ${step.done ? '' : `<button class="ghost small" data-quick-go="${escapeHtml(step.go)}">${escapeHtml(step.action)}</button>`}
    </div>
  `).join('');

  $$('[data-quick-go]').forEach((button) => {
    button.onclick = async () => {
      if (button.dataset.quickGo === 'csv') {
        await chooseCsv();
        return;
      }
      model.page = 'settings';
      persistUiState();
      renderActivePage();
      renderWorkspaceStatus();
    };
  });
}

function renderOverview() {
  const account = activeAccount();
  const dashboard = model.dashboard;
  if (!account || !dashboard) return;

  renderQuickStart();
  renderOverviewHero(account, dashboard);

  $('#overviewHealthCards').innerHTML = [
    metricCard(t('overview.health.capital'), formatCurrency(dashboard.risk.balances.capital, account.currency), account.name || '', '', 'capital'),
    metricCard(t('overview.health.balance'), formatCurrency(dashboard.risk.balances.balance, account.currency), t('overview.health.balanceHint'), '', 'balance'),
    metricCard(t('overview.health.equity'), formatCurrency(dashboard.risk.balances.equity, account.currency), t('overview.health.equityHint'), dashboard.risk.balances.openPnl >= 0 ? 'good' : 'bad', 'equity'),
    metricCard(t('overview.health.openPnl'), `${dashboard.risk.balances.openPnl >= 0 ? '+' : ''}${formatCurrency(dashboard.risk.balances.openPnl, account.currency)}`, `${dashboard.risk.openPositions.count} ${t('overview.health.positions')}`, dashboard.risk.balances.openPnl >= 0 ? 'good' : 'bad', 'position'),
  ].join('');

  const riskState = riskChip(dashboard.risk.state);
  $('#riskStateChip').className = `chip ${riskState.cls}`;
  $('#riskStateChip').textContent = riskState.label;
  $('#overviewRiskSummary').innerHTML = `
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.todayClosed'))}</span><span class="value ${classForSigned(dashboard.risk.balances.todayClosedPnl)}">${dashboard.risk.balances.todayClosedPnl > 0 ? '+' : ''}${escapeHtml(formatCurrency(dashboard.risk.balances.todayClosedPnl, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.dailyRemaining'))}</span><span class="value ${classForSigned(dashboard.risk.limits.dailyLossRemaining)}">${dashboard.risk.limits.dailyLossRemaining === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.limits.dailyLossRemaining, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.drawdownRemaining'))}</span><span class="value ${classForSigned(dashboard.risk.limits.drawdownRemaining)}">${dashboard.risk.limits.drawdownRemaining === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.limits.drawdownRemaining, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.risk.lossStreak'))}</span><span class="value">${dashboard.risk.streaks.consecutiveLosses}</span></div>
  `;
  $('#overviewWarnings').innerHTML = dashboard.risk.warnings.length
    ? dashboard.risk.warnings.map((warning) => `<span class="chip ${warning.severity === 'critical' ? 'bad' : 'warn'}">${escapeHtml(t(`warnings.${warning.code}`))}</span>`).join('')
    : `<span class="chip safe">${escapeHtml(t('warnings.ALL_CLEAR'))}</span>`;

  $('#disciplineScoreChip').className = `chip ${dashboard.discipline.score >= 70 ? 'safe' : dashboard.discipline.score >= 40 ? 'warn' : 'bad'}`;
  $('#disciplineScoreChip').textContent = `${t('overview.discipline.score')} ${formatNumber(dashboard.discipline.score, 0)}`;
  $('#overviewDisciplineSummary').innerHTML = `
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.coverage'))}</span><span class="value">${escapeHtml(formatPercent(dashboard.discipline.rates.decisionCoverage))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.executed'))}</span><span class="value">${dashboard.discipline.totals.executed}/${dashboard.discipline.totals.signals}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.missed'))}</span><span class="value ${dashboard.discipline.totals.missed ? 'value-bad' : ''}">${dashboard.discipline.totals.missed}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.discipline.linkRate'))}</span><span class="value">${escapeHtml(formatPercent(dashboard.discipline.rates.linkRate))}</span></div>
  `;
  $('#overviewReasons').innerHTML = dashboard.discipline.reasons.length
    ? dashboard.discipline.reasons.slice(0, 6).map((item) => `<span class="tag warn">${escapeHtml(item.reason)} · ${item.count}</span>`).join('')
    : `<span class="tag safe">${escapeHtml(t('signals.reasonModal.none'))}</span>`;

  const progress = dashboard.risk.challenge.progressClamped ?? 0;
  $('#challengePercentChip').textContent = dashboard.risk.challenge.progress === null ? t('ui.noValue') : formatPercent(progress);
  $('#challengeProgressBar').style.width = `${Math.max(0, Math.min(100, progress * 100))}%`;
  $('#overviewChallengeSummary').innerHTML = `
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.challenge.gain'))}</span><span class="value ${classForSigned(dashboard.risk.challenge.challengeGain)}">${dashboard.risk.challenge.challengeGain > 0 ? '+' : ''}${escapeHtml(formatCurrency(dashboard.risk.challenge.challengeGain, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.challenge.target'))}</span><span class="value">${dashboard.risk.challenge.targetAmount === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.challenge.targetAmount, account.currency))}</span></div>
    <div class="stack-row"><span class="label">${escapeHtml(t('overview.challenge.remaining'))}</span><span class="value">${dashboard.risk.challenge.challengeRemaining === null ? '—' : escapeHtml(formatCurrency(dashboard.risk.challenge.challengeRemaining, account.currency))}</span></div>
  `;

  $('#overviewNewsStatus').textContent = model.newsConfigured ? t('overview.news.live') : t('overview.news.notConfigured');
  $('#overviewNewsList').innerHTML = model.news.length
    ? model.news.slice(0, 4).map((item) => `
      <div class="item">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(item.Country || item.country || '')} · ${escapeHtml(item.Event || item.event || '')}</div>
            <div class="item-subtitle">${escapeHtml(formatDateTime(item.Date || item.date))}</div>
          </div>
          <span class="chip blue">HIGH</span>
        </div>
      </div>
    `).join('')
    : emptyState(model.newsConfigured ? t('overview.news.empty') : t('overview.news.notConfigured'));

  const liveSignals = allLiveSignalsForAccount();
  $('#overviewSignalsHint').textContent = `${liveSignals.length} ${t('signals.totalSignals')}`;
  $('#overviewSignalList').innerHTML = renderListRows(liveSignals.slice(0, 5), renderSignalCard);
}

function allLiveSignalsForAccount() {
  return (model.state?.signals || [])
    .filter((signal) => (signal.mode || 'LIVE') === 'LIVE')
    .slice()
    .sort((a, b) => String(b.importedAt || '').localeCompare(String(a.importedAt || '')));
}

function liveSignalsForAccount() {
  const query = model.search.signals.trim().toLowerCase();
  return allLiveSignalsForAccount().filter((signal) => !query || `${signal.SignalID || ''} ${signal.Instrument || ''} ${signal.Direction || ''} ${signal.Session || ''} ${signal.TF || ''}`.toLowerCase().includes(query));
}

function renderSignalCard(signal) {
  const status = signalDisplayState(signal);
  const linkedTrade = (model.state?.trades || []).find((trade) => trade.accountId === model.accountId && trade.signalId === signal.SignalID);
  const canAct = status.key === 'pending';
  return `
    <article class="item signal-card ${status.key}">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</div>
          <div class="item-subtitle">${escapeHtml(signal.TF || '')} · ${escapeHtml(signal.Session || '')} · ${escapeHtml(formatDateTime(signal.importedAt || signal.SignalTimeNY || ''))}</div>
        </div>
        <span class="chip ${status.cls}">${escapeHtml(status.label)}</span>
      </div>
      <div class="item-meta">
        ${(signal.Grade || signal.Score) ? `<span class="tag neutral">${escapeHtml(signal.Grade || '')} ${escapeHtml(String(signal.Score || ''))}</span>` : ''}
        ${linkedTrade ? `<span class="tag safe">${escapeHtml(t('signals.linkedTrade'))}</span>` : ''}
        ${status.key === 'missed' ? `<span class="tag bad">${escapeHtml(status.decision?.reason || t('signals.reasonModal.none'))}</span>` : ''}
      </div>
      <div class="item-actions">
        ${canAct ? `<button class="ghost" data-action="entered" data-signal-id="${escapeHtml(signal.SignalID)}">${escapeHtml(t('signals.actions.entered'))}</button>` : ''}
        ${canAct ? `<button class="ghost" data-action="missed" data-signal-id="${escapeHtml(signal.SignalID)}">${escapeHtml(t('signals.actions.missed'))}</button>` : ''}
        <button class="ghost" data-action="journal" data-signal-id="${escapeHtml(signal.SignalID)}">${escapeHtml(t('signals.actions.logTrade'))}</button>
      </div>
    </article>
  `;
}

function bindSignalActions() {
  $$('[data-action="entered"]').forEach((button) => {
    button.onclick = async () => {
      const signal = (model.state?.signals || []).find((item) => item.SignalID === button.dataset.signalId);
      model.state = await runBusy(t('ui.loading'), () => cisd.signalStatus(button.dataset.signalId, model.accountId, 'ORDER_PLACED', ''));
      await refreshSnapshots();
      toast(t('messages.signalEntered'), 'success');
      openJournalForSignal(signal, 'entered');
    };
  });

  $$('[data-action="missed"]').forEach((button) => {
    button.onclick = () => openReasonModal(button.dataset.signalId);
  });

  $$('[data-action="journal"]').forEach((button) => {
    const signal = (model.state?.signals || []).find((item) => item.SignalID === button.dataset.signalId);
    if (!signal) return;
    button.onclick = () => openJournalForSignal(signal, 'link');
  });
}

function renderSignalsPage() {
  const diagnostics = model.state?.settings?.lastSignalDiagnostics;
  $('#signalsCsvPath').textContent = model.state?.settings?.csvPath || t('signals.noCsv');
  $('#signalsSearch').value = model.search.signals;
  $('#signalsSummaryCards').innerHTML = [
    metricCard(t('signals.metrics.total'), String(model.dashboard?.discipline?.totals?.signals || 0), t('signals.metrics.totalHint'), '', 'signals'),
    metricCard(t('signals.metrics.executed'), String(model.dashboard?.discipline?.totals?.executed || 0), t('signals.metrics.executedHint'), 'good', 'discipline'),
    metricCard(t('signals.metrics.missed'), String(model.dashboard?.discipline?.totals?.missed || 0), t('signals.metrics.missedHint'), 'bad', 'risk'),
    metricCard(t('signals.metrics.coverage'), formatPercent(model.dashboard?.discipline?.rates?.decisionCoverage || 0), diagnostics ? `${diagnostics.added} ${t('signals.metrics.newSignals')}` : t('signals.metrics.coverageHint'), 'warn', 'source'),
  ].join('');
  $('#signalsLiveHint').textContent = diagnostics ? `${diagnostics.added} ${t('signals.metrics.newSignals')} · ${diagnostics.duplicates} ${t('signals.metrics.duplicates')}` : t('signals.summaryHint');
  $('#signalList').innerHTML = renderListRows(liveSignalsForAccount(), renderSignalCard);
  bindSignalActions();
}

function hydrateTradeForm(signal = model.journalPrefill) {
  if (!signal) return;
  $('#tradeSignal').value = signal.SignalID;
  $('#tradeSource').value = 'CISD';
  $('#tradeSymbol').value = signal.Instrument || '';
  $('#tradeSide').value = String(signal.Direction || '').startsWith('-') ? 'Sell' : 'Buy';
  $('#tradeDate').value = todayKey();
}

function clearJournalGuidance() {
  model.journalPrefill = null;
  model.journalGuidanceMode = null;
}

function openJournalForSignal(signal, mode = 'link') {
  if (!signal) return;
  model.page = 'journal';
  model.journalPrefill = signal;
  model.journalGuidanceMode = mode;
  persistUiState();
  render();
  hydrateTradeForm(signal);
  pulseElement('#tradeForm');
  const focusTarget = $('#tradeNote') || $('#tradeTags') || $('#tradeSymbol');
  focusTarget?.focus();
}

function renderJournalGuidance() {
  const panel = $('#journalGuidancePanel');
  if (!panel) return;
  const signal = model.journalPrefill;
  if (!signal) {
    panel.classList.add('hidden');
    return;
  }

  panel.classList.remove('hidden');
  const isEntered = model.journalGuidanceMode === 'entered';
  $('#journalGuidanceTitle').textContent = isEntered ? t('journal.guidance.titleEntered') : t('journal.guidance.titleLinked');
  $('#journalGuidanceText').textContent = isEntered ? t('journal.guidance.textEntered') : t('journal.guidance.textLinked');
  $('#journalGuidanceTags').innerHTML = [
    `<span class="tag blue">${escapeHtml(signal.Instrument || '')}</span>`,
    `<span class="tag neutral">${escapeHtml(signal.Direction || '')}</span>`,
    `<span class="tag neutral">${escapeHtml(signal.TF || '')}</span>`,
    `<span class="tag ${isEntered ? 'safe' : 'warn'}">${escapeHtml(isEntered ? t('journal.guidance.enteredBadge') : t('journal.guidance.linkBadge'))}</span>`,
  ].join('');
}

function renderJournal() {
  renderJournalGuidance();
  const signals = allLiveSignalsForAccount();
  const tradeQuery = model.search.journal.trim().toLowerCase();
  const trades = (model.state?.trades || [])
    .filter((trade) => trade.accountId === model.accountId)
    .filter((trade) => !tradeQuery || `${trade.symbol || ''} ${trade.side || ''} ${trade.source || ''} ${trade.tags || ''} ${trade.note || ''}`.toLowerCase().includes(tradeQuery))
    .slice(0, 8);

  $('#tradeSignal').innerHTML = `<option value="">${escapeHtml(t('journal.form.noSignal'))}</option>${signals.map((signal) => `<option value="${escapeHtml(signal.SignalID)}">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')} · ${escapeHtml(signal.TF || '')}</option>`).join('')}`;
  $('#journalSearch').value = model.search.journal;
  $('#tradeDate').value = $('#tradeDate').value || todayKey();
  if (model.journalPrefill) hydrateTradeForm(model.journalPrefill);

  $('#recentTradesList').innerHTML = renderListRows(trades, (trade) => `
    <article class="item">
      <div class="item-head">
        <div>
          <div class="item-title">${escapeHtml(trade.symbol || '')} · ${escapeHtml(trade.side || '')}</div>
          <div class="item-subtitle">${escapeHtml(trade.source || '')} · ${escapeHtml(formatShortDate(trade.date || trade.createdAt))}</div>
        </div>
        <div class="${classForSigned(trade.resultR ?? trade.netProfit)}">${(Number(trade.resultR ?? trade.netProfit) || 0) > 0 ? '+' : ''}${escapeHtml(formatNumber(trade.resultR ?? trade.netProfit, 2))}${trade.resultR !== null && trade.resultR !== undefined ? 'R' : ''}</div>
      </div>
      <div class="item-meta">
        ${trade.signalId ? `<span class="tag blue">${escapeHtml(t('journal.recentTrades.linked'))}</span>` : ''}
        ${(trade.tags || '').split(',').filter(Boolean).slice(0, 3).map((tag) => `<span class="tag neutral">${escapeHtml(tag.trim())}</span>`).join('')}
      </div>
    </article>
  `);
}

function backtestsForAccount() {
  return (model.state?.backtests || []).filter((item) => item.accountId === model.accountId);
}

function selectedBacktest() {
  const sessions = backtestsForAccount();
  const selected = sessions.find((item) => item.id === model.selectedBacktestId);
  return selected || sessions[0] || null;
}

function backtestSignalsForSelected() {
  const selected = selectedBacktest();
  if (!selected) return [];
  return (model.state?.backtestSignals || [])
    .filter((item) => item.backtestId === selected.id)
    .slice()
    .sort((a, b) => String(a.signalAt || '').localeCompare(String(b.signalAt || '')));
}

function renderBacktestSpotlight(selected, reviewSignals) {
  $('#backtestSpotlightTitle').textContent = t('backtest.spotlight.title');
  $('#backtestSpotlightHint').textContent = selected ? (selected.name || t('backtest.create.defaultName')) : t('backtest.spotlight.emptyHint');
  if (!selected) {
    $('#backtestSpotlightCards').innerHTML = emptyState(t('backtest.spotlight.empty'));
    $('#backtestSpotlightTags').innerHTML = '';
    return;
  }

  const reviewed = reviewSignals.filter((signal) => ['WIN', 'LOSS', 'BE', 'MISSED'].includes(String(signal.status || '').toUpperCase()));
  const scored = reviewSignals.filter((signal) => ['WIN', 'LOSS', 'BE'].includes(String(signal.status || '').toUpperCase()));
  const wins = scored.filter((signal) => String(signal.status).toUpperCase() === 'WIN').length;
  const net = scored.reduce((sum, signal) => sum + (Number(signal.resultR) || 0), 0);
  const avg = scored.length ? net / scored.length : 0;

  $('#backtestSpotlightCards').innerHTML = [
    metricCard(t('backtest.spotlight.matched'), String(reviewSignals.length), t('backtest.spotlight.matchedHint'), '', 'signals'),
    metricCard(t('backtest.spotlight.reviewed'), `${reviewed.length}/${reviewSignals.length || 0}`, t('backtest.spotlight.reviewedHint'), reviewed.length === reviewSignals.length && reviewSignals.length ? 'good' : 'warn', 'backtest'),
    metricCard(t('backtest.spotlight.winRate'), scored.length ? formatPercent(wins / scored.length) : '—', t('backtest.spotlight.winRateHint'), wins / Math.max(scored.length, 1) >= 0.5 ? 'good' : 'warn', 'analytics'),
    metricCard(t('backtest.spotlight.net'), `${net > 0 ? '+' : ''}${formatNumber(net, 2)}R`, `${t('backtest.spotlight.avg')} ${avg > 0 ? '+' : ''}${formatNumber(avg, 2)}R`, net >= 0 ? 'good' : 'bad', 'curve'),
  ].join('');

  $('#backtestSpotlightTags').innerHTML = [
    selected.filters?.start ? `<span class="tag neutral">${escapeHtml(selected.filters.start)} → ${escapeHtml(selected.filters.end || '')}</span>` : '',
    selected.filters?.session ? `<span class="tag blue">${escapeHtml(selected.filters.session)}</span>` : '',
    selected.filters?.symbol ? `<span class="tag blue">${escapeHtml(selected.filters.symbol)}</span>` : '',
    selected.filters?.tf ? `<span class="tag blue">${escapeHtml(selected.filters.tf)}</span>` : '',
  ].filter(Boolean).join('');
}

function renderBacktest() {
  const sessions = backtestsForAccount();
  const selected = selectedBacktest();
  $('#backtestSearch').value = model.search.backtest;
  if (selected) model.selectedBacktestId = selected.id;
  else model.selectedBacktestId = null;

  $('#backtestLibrary').innerHTML = renderListRows(sessions, (session) => {
    const signals = (model.state?.backtestSignals || []).filter((item) => item.backtestId === session.id);
    const reviewed = signals.filter((item) => ['WIN', 'LOSS', 'BE', 'MISSED'].includes(String(item.status || '').toUpperCase())).length;
    const isActive = session.id === selected?.id;
    return `
      <article class="item ${isActive ? 'account-card active' : ''}">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(session.name || t('backtest.create.defaultName'))}</div>
            <div class="item-subtitle">${escapeHtml(session.filters?.start || '')} → ${escapeHtml(session.filters?.end || '')}</div>
          </div>
          <span class="chip blue">${signals.length}</span>
        </div>
        <div class="item-meta">
          ${session.filters?.session ? `<span class="tag neutral">${escapeHtml(session.filters.session)}</span>` : ''}
          ${session.filters?.symbol ? `<span class="tag neutral">${escapeHtml(session.filters.symbol)}</span>` : ''}
          ${session.filters?.tf ? `<span class="tag neutral">${escapeHtml(session.filters.tf)}</span>` : ''}
          <span class="tag neutral">${reviewed}/${signals.length} ${escapeHtml(t('backtest.library.reviewed'))}</span>
        </div>
        <div class="item-actions">
          <button class="ghost" data-backtest-open="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.open'))}</button>
          <button class="ghost" data-backtest-refresh="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.refresh'))}</button>
          <button class="ghost" data-backtest-reset="${escapeHtml(session.id)}">${escapeHtml(t('backtest.library.reset'))}</button>
        </div>
      </article>
    `;
  });

  const reviewQuery = model.search.backtest.trim().toLowerCase();
  const reviewSignals = backtestSignalsForSelected().filter((signal) => !reviewQuery || `${signal.SignalID || ''} ${signal.Instrument || ''} ${signal.Direction || ''} ${signal.Session || ''} ${signal.TF || ''} ${signal.reviewNote || ''}`.toLowerCase().includes(reviewQuery));
  renderBacktestSpotlight(selected, backtestSignalsForSelected());
  $('#backtestReviewList').innerHTML = renderListRows(reviewSignals, (signal) => {
    const reviewed = ['WIN', 'LOSS', 'BE', 'MISSED'].includes(String(signal.status || '').toUpperCase());
    return `
      <article class="item signal-card ${reviewed ? (signal.status === 'MISSED' ? 'missed' : 'executed') : 'pending'}">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</div>
            <div class="item-subtitle">${escapeHtml(signal.TF || '')} · ${escapeHtml(signal.Session || '')} · ${escapeHtml(formatDateTime(signal.signalAt || signal.importedAt || ''))}</div>
          </div>
          <span class="chip ${signal.status === 'MISSED' ? 'bad' : reviewed ? 'safe' : 'warn'}">${escapeHtml(signal.status === 'NEW' ? t('signals.status.pending') : signal.status)}</span>
        </div>
        <div class="item-meta">
          ${signal.reviewNote ? `<span class="tag warn">${escapeHtml(signal.reviewNote)}</span>` : ''}
          ${signal.resultR !== null && signal.resultR !== undefined ? `<span class="tag blue">${signal.resultR > 0 ? '+' : ''}${escapeHtml(formatNumber(signal.resultR, 2))}R</span>` : ''}
        </div>
        <div class="item-actions">
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="WIN" data-result="1">${escapeHtml(t('backtest.review.statuses.win'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="LOSS" data-result="-1">${escapeHtml(t('backtest.review.statuses.loss'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="BE" data-result="0">${escapeHtml(t('backtest.review.statuses.be'))}</button>
          <button class="ghost" data-backtest-review="${escapeHtml(signal.id)}" data-status="MISSED">${escapeHtml(t('backtest.review.statuses.missed'))}</button>
        </div>
      </article>
    `;
  });

  $$('[data-backtest-open]').forEach((button) => {
    button.onclick = () => {
      model.selectedBacktestId = button.dataset.backtestOpen;
      persistUiState();
      renderBacktest();
      renderWorkspaceStatus();
    };
  });
  $$('[data-backtest-refresh]').forEach((button) => {
    button.onclick = async () => {
      await runBusy(t('ui.loading'), () => cisd.refreshBacktest(button.dataset.backtestRefresh));
      await refreshStateAndRender();
      toast(t('messages.backtestRefreshed'), 'success');
    };
  });
  $$('[data-backtest-reset]').forEach((button) => {
    button.onclick = async () => {
      const ok = await openConfirm({
        title: t('backtest.library.reset'),
        text: t('backtest.library.resetConfirm'),
        confirmLabel: t('backtest.library.reset'),
      });
      if (!ok) return;
      await runBusy(t('ui.loading'), () => cisd.resetBacktest(button.dataset.backtestReset));
      if (model.selectedBacktestId === button.dataset.backtestReset) model.selectedBacktestId = null;
      persistUiState();
      await refreshStateAndRender();
      toast(t('messages.backtestReset'), 'success');
    };
  });
  $$('[data-backtest-review]').forEach((button) => {
    button.onclick = () => {
      openBacktestReviewModal(button.dataset.backtestReview, button.dataset.status, button.dataset.result || '');
    };
  });
}

function populateFilterSelect(selectId, options, current, defaultLabel) {
  const select = $(selectId);
  if (!select) return;
  select.innerHTML = `<option value="all">${escapeHtml(defaultLabel)}</option>${options.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`).join('')}`;
  select.value = current || 'all';
}

function formatEdgeValue(value, unit, withSign = true) {
  const number = Number(value) || 0;
  const sign = withSign && number > 0 ? '+' : '';
  if (unit === 'R') return `${sign}${formatNumber(number, 2)}R`;
  return `${sign}${formatCurrency(number, activeAccount()?.currency)}`;
}

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
  });

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
  });
}

function renderAnalytics() {
  const analytics = model.analytics;
  if (!analytics) return;

  const filterLabels = {
    period: {
      all: t('analytics.filters.allTime'),
      today: t('analytics.filters.today'),
      week: t('analytics.filters.week'),
      month: t('analytics.filters.month'),
    },
    source: {
      all: t('analytics.filters.allSources'),
      manual: t('analytics.sources.manual'),
      cisd: t('analytics.sources.cisd'),
      imported: t('analytics.sources.imported'),
      backtest: t('analytics.sources.backtest'),
    },
    side: {
      all: t('analytics.filters.allSides'),
      Buy: 'Buy',
      Sell: 'Sell',
    },
    session: {
      all: t('analytics.filters.allSessions'),
      London: 'London',
      'New York': 'New York',
      After: 'After',
    },
  };
  const activeFilters = [
    model.filters.period !== 'all' ? `${t('analytics.filters.labelPeriod')}: ${filterLabels.period[model.filters.period] || model.filters.period}` : '',
    model.filters.source !== 'all' ? `${t('analytics.filters.labelSource')}: ${filterLabels.source[model.filters.source] || model.filters.source}` : '',
    model.filters.instrument !== 'all' ? `${t('analytics.filters.labelInstrument')}: ${model.filters.instrument}` : '',
    model.filters.side !== 'all' ? `${t('analytics.filters.labelSide')}: ${filterLabels.side[model.filters.side] || model.filters.side}` : '',
    model.filters.session !== 'all' ? `${t('analytics.filters.labelSession')}: ${filterLabels.session[model.filters.session] || model.filters.session}` : '',
  ].filter(Boolean);
  $('#analyticsSummaryHint').textContent = activeFilters.length ? activeFilters.join(' · ') : t('analytics.summaryHint');
  $('#analyticsFilterChips').innerHTML = activeFilters.length
    ? activeFilters.map((label) => `<span class="tag blue">${escapeHtml(label)}</span>`).join('')
    : `<span class="tag neutral">${escapeHtml(t('analytics.filterNone'))}</span>`;

  $('#analyticsSummaryCards').innerHTML = [
    metricCard(t('analytics.cards.total'), String(analytics.totals.count), t('analytics.cards.totalHint'), '', 'analytics'),
    metricCard(t('analytics.cards.winRate'), formatPercent(analytics.totals.count ? analytics.totals.wins / analytics.totals.count : 0), `${analytics.totals.wins} / ${analytics.totals.losses}`, analytics.totals.net >= 0 ? 'good' : 'bad', 'discipline'),
    metricCard(t('analytics.cards.net'), `${analytics.totals.net > 0 ? '+' : ''}${formatNumber(analytics.totals.net, 2)}`, t('analytics.cards.netHint'), analytics.totals.net >= 0 ? 'good' : 'bad', 'curve'),
    metricCard(t('analytics.cards.expectancy'), `${analytics.totals.expectancy > 0 ? '+' : ''}${formatNumber(analytics.totals.expectancy, 2)}`, t('analytics.cards.expectancyHint'), '', 'compare'),
    metricCard(t('analytics.cards.pf'), analytics.totals.profitFactor === null ? '—' : formatNumber(analytics.totals.profitFactor, 2), t('analytics.cards.pfHint'), '', 'source'),
    metricCard(t('analytics.cards.payoff'), analytics.totals.payoffRatio === null ? '—' : formatNumber(analytics.totals.payoffRatio, 2), t('analytics.cards.payoffHint'), '', 'tag'),
    metricCard(t('analytics.cards.maxDd'), formatNumber(analytics.totals.maxDrawdown, 2), t('analytics.cards.maxDdHint'), 'bad', 'risk'),
    metricCard(t('analytics.cards.currentStreak'), `${t(`analytics.streak.${analytics.totals.currentStreak.type}`)} · ${analytics.totals.currentStreak.count}`, t('analytics.cards.currentStreakHint'), '', 'session'),
  ].join('');

  $('#analyticsCurve').innerHTML = buildCurveSvg(analytics.totals.equityCurve);
  $('#analyticsCurveMeta').innerHTML = [
    { label: t('analytics.curveStats.best'), value: analytics.totals.bestResult, tone: analytics.totals.bestResult >= 0 ? 'good' : 'bad' },
    { label: t('analytics.curveStats.worst'), value: analytics.totals.worstResult, tone: analytics.totals.worstResult >= 0 ? 'good' : 'bad' },
    { label: t('analytics.curveStats.avgWin'), value: analytics.totals.avgWin, tone: analytics.totals.avgWin >= 0 ? 'good' : 'bad' },
    { label: t('analytics.curveStats.avgLoss'), value: analytics.totals.avgLoss, tone: analytics.totals.avgLoss >= 0 ? 'good' : 'bad' },
  ].map((item) => `<div class="micro-stat"><small>${escapeHtml(item.label)}</small><strong class="value-${item.tone}">${item.value > 0 ? '+' : ''}${escapeHtml(formatNumber(item.value, 2))}</strong></div>`).join('');
  renderBreakdown('#analyticsBySource', analytics.breakdowns.bySource);
  renderBreakdown('#analyticsBySession', analytics.breakdowns.bySession);
  renderBreakdown('#analyticsBySide', analytics.breakdowns.bySide);
  renderBreakdown('#analyticsByInstrument', analytics.breakdowns.byInstrument);
  renderBreakdown('#analyticsByTag', analytics.breakdowns.byTag);
  renderBreakdown('#analyticsByMonth', analytics.breakdowns.byMonth);
  renderBreakdown('#analyticsBacktestComparison', analytics.backtestComparison, 'backtest');
  renderHeatmap(analytics.heatmap);

  populateFilterSelect('#filterSource', analytics.availableFilters.sources, model.filters.source, t('analytics.filters.allSources'));
  populateFilterSelect('#filterInstrument', analytics.availableFilters.instruments, model.filters.instrument, t('analytics.filters.allInstruments'));
  populateFilterSelect('#filterSide', ['Buy', 'Sell'], model.filters.side, t('analytics.filters.allSides'));
  populateFilterSelect('#filterSession', analytics.availableFilters.sessions, model.filters.session, t('analytics.filters.allSessions'));
}

function renderData() {
  const account = activeAccount();
  const signalDiagnostics = model.state?.settings?.lastSignalDiagnostics;
  const items = [
    {
      title: t('data.sources.cisd'),
      icon: 'signals',
      status: model.state?.settings?.csvPath ? t('data.status.ready') : t('data.status.missing'),
      meta: signalDiagnostics ? `${signalDiagnostics.added} ${t('signals.metrics.newSignals')} · ${signalDiagnostics.duplicates} ${t('signals.metrics.duplicates')}` : t('data.status.noRuns'),
      cls: model.state?.settings?.csvPath ? 'blue' : 'neutral',
    },
    {
      title: t('data.sources.mt5'),
      icon: 'import',
      status: account?.lastMT5Import ? formatDateTime(account.lastMT5Import) : t('data.status.noRuns'),
      meta: account?.lastMT5Diagnostics ? `${account.lastMT5Diagnostics.added} ${t('data.labels.added')} · ${account.lastMT5Diagnostics.duplicates} ${t('signals.metrics.duplicates')}` : (account?.lastMT5Error || t('data.status.notConfigured')),
      cls: account?.lastMT5Error ? 'bad' : account?.lastMT5Import ? 'safe' : 'neutral',
    },
    {
      title: t('data.sources.fundedNext'),
      icon: 'source',
      status: account?.lastFundedNextImport ? formatDateTime(account.lastFundedNextImport) : t('data.status.noRuns'),
      meta: account?.lastFundedNextDiagnostics ? `${account.lastFundedNextDiagnostics.added} ${t('data.labels.added')} · ${account.lastFundedNextDiagnostics.openPositions} ${t('data.labels.openPositions')}` : (account?.lastFundedNextError || t('data.status.notConfigured')),
      cls: account?.lastFundedNextError ? 'bad' : account?.fundedNextFolder ? 'safe' : 'neutral',
    },
    {
      title: t('data.sources.fundingAccess'),
      icon: 'link',
      status: account?.lastFundingSync ? formatDateTime(account.lastFundingSync) : (model.fundingAccess?.configured ? t('data.status.ready') : t('data.status.notConfigured')),
      meta: account?.lastFundingError || (model.fundingAccess?.mode === 'investor_pass' ? t('funding.modes.investor') : model.fundingAccess?.mode === 'shared_url' ? t('funding.modes.sharedUrl') : t('funding.modes.none')),
      cls: account?.lastFundingError ? 'bad' : model.fundingAccess?.configured ? 'safe' : 'neutral',
    },
  ];

  $('#dataSourcesList').innerHTML = renderListRows(items, (item) => `
    <article class="item diagnostic-card ${item.cls}">
      <div class="item-head">
        <div>
          <div class="item-title with-inline-icon">${icon(item.icon,'mini-inline-icon')}${escapeHtml(item.title)}</div>
          <div class="item-subtitle">${escapeHtml(item.meta)}</div>
        </div>
        <span class="chip ${item.cls}">${escapeHtml(item.status)}</span>
      </div>
    </article>
  `);

  const history = (model.state?.importHistory || []).filter((entry) => !entry.accountId || entry.accountId === model.accountId).slice(0, 10);
  $('#dataImportHistory').innerHTML = renderListRows(history, (entry) => {
    const diagnostics = entry.diagnostics || {};
    return `
      <article class="item">
        <div class="item-head">
          <div>
            <div class="item-title">${escapeHtml(entry.source || '')}</div>
            <div class="item-subtitle">${escapeHtml(entry.file || '')} · ${escapeHtml(formatDateTime(entry.at || ''))}</div>
          </div>
          <span class="chip blue">${escapeHtml(entry.sourceType || 'import')}</span>
        </div>
        <div class="item-meta">
          <span class="tag neutral">${escapeHtml(t('data.labels.added'))}: ${diagnostics.added ?? entry.added ?? 0}</span>
          <span class="tag neutral">${escapeHtml(t('signals.metrics.duplicates'))}: ${diagnostics.duplicates || 0}</span>
          <span class="tag neutral">${escapeHtml(t('data.labels.invalid'))}: ${diagnostics.invalidRows || 0}</span>
          ${diagnostics.openPositions ? `<span class="tag neutral">${escapeHtml(t('data.labels.openPositions'))}: ${diagnostics.openPositions}</span>` : ''}
        </div>
      </article>
    `;
  });
}

function toggleFundingAccessFields() {
  const mode = $('#fundingAccessModeInput')?.value || 'none';
  $$('.investor-field').forEach((el) => el.classList.toggle('hidden', mode !== 'investor_pass'));
  $$('.shared-url-field').forEach((el) => el.classList.toggle('hidden', mode !== 'shared_url'));
}

function renderSettings() {
  const account = activeAccount();
  const access = model.fundingAccess || { mode: 'none', syncScope: 'full_readonly', hasStoredPassword: false, configured: false };
  const readiness = model.runtimeReadiness?.mt5Bridge;
  $('#accountFirmInput').value = account?.firm || '';
  $('#accountNameInput').value = account?.name || '';
  $('#accountCapitalInput').value = account?.capital ?? '';
  $('#accountBalanceInput').value = account?.currentBalance ?? '';
  $('#accountCurrencyInput').value = account?.currency || 'USD';
  $('#accountPhaseInput').value = account?.phase || 'Challenge';
  $('#accountTargetInput').value = account?.profitTarget ?? '';
  $('#accountDailyLossInput').value = account?.dailyLoss ?? '';
  $('#accountMaxDrawdownInput').value = account?.maxDrawdown ?? '';

  $('#fundingAccessModeInput').value = access.mode || 'none';
  $('#fundingSyncScopeInput').value = access.syncScope || 'full_readonly';
  $('#investorLoginInput').value = access.investorLogin || '';
  $('#investorServerInput').value = access.investorServer || '';
  $('#sharedUrlInput').value = access.sharedDashboardUrl || '';
  $('#investorPasswordInput').value = '';
  toggleFundingAccessFields();
  $('#fundingAccessStatus').textContent = access.mode === 'investor_pass'
    ? (access.configured ? t('funding.statusInvestorConfigured') : t('funding.statusInvestorMissing'))
    : access.mode === 'shared_url'
      ? (access.configured ? t('funding.statusUrlConfigured') : t('funding.statusUrlMissing'))
      : t('funding.statusManualOnly');
  if (access.mode === 'investor_pass' && access.hasStoredPassword) {
    $('#fundingAccessStatus').textContent += ` · ${t('funding.passwordStored')}`;
  }
  if (access.mode === 'investor_pass' && readiness) {
    $('#fundingAccessStatus').textContent += readiness.packagedExecutableExists
      ? ` · ${t('funding.bridgeReady')}`
      : ` · ${t('funding.bridgeMissing')}`;
  }
  $('#openFundingAccessBtn').disabled = !(access.mode === 'shared_url' && access.sharedDashboardUrl);
  $('#syncFundingAccessBtn').disabled = !access.configured || (access.mode === 'investor_pass' && readiness && !readiness.packagedExecutableExists && model.runtimeReadiness?.packaged);

  $('#settingsLanguage').value = model.state?.settings?.locale || 'ar';
  $('#settingsTimezone').value = model.state?.settings?.timezone || 'America/New_York';
  $('#settingsNotifications').checked = model.state?.settings?.notifications !== false;
  $('#newsProvider').value = model.state?.settings?.newsProvider || 'FMP';
  $('#terminalPathLabel').textContent = account?.terminalPath || t('settings.noTerminal');
  $('#newsConnectionStatus').textContent = model.newsConfigured ? t('settings.newsConnected') : t('settings.newsDisconnected');
}

function renderActivePage() {
  $$('.page').forEach((page) => page.classList.toggle('active', page.dataset.page === model.page));
  $$('.nav-link').forEach((button) => button.classList.toggle('active', button.dataset.page === model.page));
  pulseActivePage();
}

function renderReasonModal() {
  const hidden = !model.reasonSignalId;
  $('#reasonModal').classList.toggle('hidden', hidden);
  if (hidden) return;

  const presets = ['hesitation', 'fear', 'news', 'late', 'rule-break'];
  $('#reasonPresets').innerHTML = presets.map((key) => `
    <button class="ghost ${model.reasonPreset === key ? 'active' : ''}" data-reason-preset="${key}">${escapeHtml(t(`signals.reasonModal.presets.${key}`))}</button>
  `).join('');
  $$('[data-reason-preset]').forEach((button) => {
    button.onclick = () => {
      model.reasonPreset = button.dataset.reasonPreset;
      renderReasonModal();
    };
  });
}

function backtestSignalById(signalId) {
  return (model.state?.backtestSignals || []).find((item) => item.id === signalId) || null;
}

function openBacktestReviewModal(signalId, presetStatus = 'WIN', presetResult = '') {
  const signal = backtestSignalById(signalId);
  if (!signal) return;
  model.backtestReviewSignalId = signalId;
  model.backtestReviewStatus = presetStatus;
  $('#backtestReviewResultInput').value = presetResult;
  $('#backtestReviewNoteInput').value = signal.reviewNote || '';
  renderBacktestReviewModal();
}

function closeBacktestReviewModal() {
  model.backtestReviewSignalId = null;
  model.backtestReviewStatus = 'WIN';
  $('#backtestReviewResultInput').value = '';
  $('#backtestReviewNoteInput').value = '';
  renderBacktestReviewModal();
}

function renderBacktestReviewModal() {
  const hidden = !model.backtestReviewSignalId;
  $('#backtestReviewModal').classList.toggle('hidden', hidden);
  if (hidden) return;

  const signal = backtestSignalById(model.backtestReviewSignalId);
  if (!signal) {
    closeBacktestReviewModal();
    return;
  }

  $('#backtestReviewSignalSummary').innerHTML = `
    <div class="review-summary-title">${escapeHtml(signal.Instrument || '')} · ${escapeHtml(signal.Direction || '')}</div>
    <div class="review-summary-meta">
      <span class="tag neutral">${escapeHtml(signal.TF || '')}</span>
      <span class="tag neutral">${escapeHtml(signal.Session || '')}</span>
      <span class="tag blue">${escapeHtml(formatDateTime(signal.signalAt || signal.importedAt || ''))}</span>
      ${signal.SignalID ? `<span class="tag neutral">ID: ${escapeHtml(signal.SignalID)}</span>` : ''}
    </div>
  `;

  const statuses = [
    { key: 'WIN', label: t('backtest.review.statuses.win'), cls: 'win', defaultResult: '1' },
    { key: 'LOSS', label: t('backtest.review.statuses.loss'), cls: 'loss', defaultResult: '-1' },
    { key: 'BE', label: t('backtest.review.statuses.be'), cls: 'be', defaultResult: '0' },
    { key: 'MISSED', label: t('backtest.review.statuses.missed'), cls: 'missed', defaultResult: '' },
  ];
  $('#backtestReviewStatusButtons').innerHTML = statuses.map((status) => `
    <button class="ghost ${status.cls} ${model.backtestReviewStatus === status.key ? 'active' : ''}" data-review-status="${status.key}" data-default-result="${status.defaultResult}">${escapeHtml(status.label)}</button>
  `).join('');

  const resultInput = $('#backtestReviewResultInput');
  resultInput.disabled = model.backtestReviewStatus === 'MISSED';
  if (model.backtestReviewStatus === 'MISSED') resultInput.value = '';

  $$('[data-review-status]').forEach((button) => {
    button.onclick = () => {
      model.backtestReviewStatus = button.dataset.reviewStatus;
      if (model.backtestReviewStatus !== 'MISSED' && !$('#backtestReviewResultInput').value) {
        $('#backtestReviewResultInput').value = button.dataset.defaultResult || '';
      }
      renderBacktestReviewModal();
    };
  });
}

async function saveBacktestReviewFromModal() {
  const signal = backtestSignalById(model.backtestReviewSignalId);
  if (!signal) return;
  const status = model.backtestReviewStatus;
  const note = $('#backtestReviewNoteInput').value.trim();
  const resultValue = $('#backtestReviewResultInput').value.trim();
  if (status !== 'MISSED' && resultValue === '') {
    toast(t('backtest.review.resultRequired'), 'warn');
    return;
  }
  await runBusy(t('ui.loading'), () => cisd.reviewBacktestSignal(model.backtestReviewSignalId, {
    status,
    resultR: status === 'MISSED' ? null : Number(resultValue || 0),
    note,
  }));
  await refreshStateAndRender();
  closeBacktestReviewModal();
  toast(t('messages.backtestReviewed'), 'success');
}

function render() {
  applyStaticText();
  fillPeriodOptions();
  renderWorkspaceStatus();
  renderAccounts();
  renderOverview();
  renderSignalsPage();
  renderJournal();
  renderBacktest();
  renderEdge();
  renderAnalytics();
  renderData();
  renderSettings();
  renderReasonModal();
  renderBacktestReviewModal();
  renderActivePage();
}

async function refreshRuntimeReadiness() {
  model.runtimeReadiness = await cisd.runtimeReadiness();
}

async function refreshFundingAccess() {
  const account = ensureAccount();
  if (!account) {
    model.fundingAccess = null;
    return;
  }
  model.fundingAccess = await cisd.getFundingAccess(model.accountId);
}

async function refreshSnapshots() {
  const account = ensureAccount();
  if (!account) return;
  model.dashboard = await cisd.dashboardSnapshot(model.accountId, { risk: { today: todayKey() } });
  model.analytics = await cisd.analyticsSnapshot(model.accountId, model.filters);
  model.edge = await cisd.edgeSnapshot(model.accountId, { risk: { today: todayKey() } });
}

async function refreshStateAndRender() {
  model.state = await cisd.state();
  ensureAccount();
  model.newsConfigured = (await cisd.newsStatus()).configured;
  await refreshRuntimeReadiness();
  await refreshFundingAccess();
  await refreshSnapshots();
  persistUiState();
  render();
  pulseElement('.status-dock');
}

async function loadNews(silent = false) {
  try {
    const status = await cisd.newsStatus();
    model.newsConfigured = status.configured;
    if (!status.configured) {
      model.news = [];
      render();
      if (!silent) toast(t('settings.newsDisconnected'), 'warn');
      return;
    }
    model.news = await runBusy(t('ui.loading'), () => cisd.fetchNews());
    render();
    if (!silent) toast(t('messages.newsLoaded'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

function openReasonModal(signalId) {
  model.reasonSignalId = signalId;
  model.reasonPreset = 'hesitation';
  $('#reasonNote').value = '';
  renderReasonModal();
}

function closeReasonModal() {
  model.reasonSignalId = null;
  $('#reasonNote').value = '';
  renderReasonModal();
}

async function saveReason() {
  const reasonText = $('#reasonNote').value.trim();
  const preset = t(`signals.reasonModal.presets.${model.reasonPreset}`);
  const combined = reasonText ? `${preset} — ${reasonText}` : preset;
  model.state = await runBusy(t('ui.loading'), () => cisd.signalStatus(model.reasonSignalId, model.accountId, 'MISSED', combined));
  await refreshSnapshots();
  closeReasonModal();
  render();
  toast(t('messages.signalMissedSaved'), 'success');
}

async function saveAccountSettings(event) {
  event?.preventDefault();
  const account = activeAccount();
  if (!account) return;
  model.state = await runBusy(t('ui.loading'), () => cisd.saveAccount({
    id: account.id,
    firm: $('#accountFirmInput').value.trim(),
    name: $('#accountNameInput').value.trim(),
    capital: Number($('#accountCapitalInput').value || 0),
    currentBalance: Number($('#accountBalanceInput').value || 0),
    currency: $('#accountCurrencyInput').value,
    phase: $('#accountPhaseInput').value,
    profitTarget: Number($('#accountTargetInput').value || 0),
    dailyLoss: Number($('#accountDailyLossInput').value || 0),
    maxDrawdown: Number($('#accountMaxDrawdownInput').value || 0),
  }));
  await refreshFundingAccess();
  await refreshSnapshots();
  persistUiState();
  render();
  toast(t('messages.accountSettingsSaved'), 'success');
}

async function saveFundingAccess() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.saveFundingAccess(model.accountId, {
      mode: $('#fundingAccessModeInput').value,
      syncScope: $('#fundingSyncScopeInput').value,
      investorLogin: $('#investorLoginInput').value.trim(),
      investorServer: $('#investorServerInput').value.trim(),
      investorPassword: $('#investorPasswordInput').value,
      sharedDashboardUrl: $('#sharedUrlInput').value.trim(),
    }));
    model.state = result.state;
    model.fundingAccess = result.fundingAccess;
    $('#investorPasswordInput').value = '';
    await refreshSnapshots();
    persistUiState();
    render();
    toast(t('messages.fundingAccessSaved'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function openFundingAccess() {
  try {
    const access = model.fundingAccess;
    if (access?.mode === 'shared_url' && access.sharedDashboardUrl) {
      const result = await cisd.openFunding(model.accountId);
      if (result) toast(result, 'info');
      return;
    }
    toast(t('funding.openNotAvailable'), 'warn');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function syncFundingAccessNow() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.syncFundingAccess(model.accountId));
    model.state = result.state;
    model.fundingAccess = result.fundingAccess || model.fundingAccess;
    await refreshSnapshots();
    persistUiState();
    render();
    const mode = model.fundingAccess?.mode;
    const key = mode === 'shared_url' ? 'messages.fundingSyncSharedSuccess' : mode === 'investor_pass' ? 'messages.fundingSyncInvestorSuccess' : 'messages.fundingSyncSuccess';
    toast(t(key), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function savePreferences() {
  const previousLocale = model.state?.settings?.locale || 'ar';
  const locale = $('#settingsLanguage').value;
  await runBusy(t('ui.loading'), () => cisd.updateSettings({
    locale,
    timezone: $('#settingsTimezone').value,
    notifications: $('#settingsNotifications').checked,
  }));
  if (previousLocale !== locale) {
    location.reload();
    return;
  }
  await refreshStateAndRender();
  toast(t('messages.preferencesSaved'), 'success');
}

async function saveNewsSettings() {
  try {
    await runBusy(t('ui.loading'), async () => {
      await cisd.saveNewsProvider($('#newsProvider').value);
      const key = $('#newsKey').value.trim();
      if (key) await cisd.saveNewsKey(key);
    });
    $('#newsKey').value = '';
    await refreshStateAndRender();
    await loadNews(true);
    toast(t('messages.newsSettingsSaved'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function saveTrade(event) {
  event.preventDefault();
  const account = activeAccount();
  if (!account) return;

  const signalId = $('#tradeSignal').value;
  const trade = {
    accountId: account.id,
    source: $('#tradeSource').value,
    symbol: $('#tradeSymbol').value.trim().toUpperCase(),
    side: $('#tradeSide').value,
    resultR: Number($('#tradeResult').value || 0),
    date: $('#tradeDate').value || todayKey(),
    signalId: signalId || '',
    tags: $('#tradeTags').value.trim(),
    note: $('#tradeNote').value.trim(),
    beforeImage: model.tradeCharts.beforeImage,
    afterImage: model.tradeCharts.afterImage,
  };

  if (!trade.symbol) {
    toast(t('journal.form.symbolRequired'), 'warn');
    return;
  }

  model.state = await runBusy(t('ui.loading'), async () => {
    const updated = await cisd.addTrade(trade);
    if (signalId) return cisd.signalStatus(signalId, account.id, 'ORDER_PLACED', '');
    return updated;
  });
  await refreshSnapshots();
  $('#tradeForm').reset();
  $('#tradeDate').value = todayKey();
  model.tradeCharts = { beforeImage: '', afterImage: '' };
  renderChartSlots();
  clearJournalGuidance();
  render();
  toast(t('messages.tradeSaved'), 'success');
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
  };
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.startBacktest(payload));
    model.selectedBacktestId = result.state?.activeBacktestId || result.state?.backtests?.[0]?.id || null;
    persistUiState();
    await refreshStateAndRender();
    $('#backtestForm').reset();
    toast(`${t('messages.backtestImported')} ${result.count}`, 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

function openAccountModal() {
  $('#accountModalFirm').value = 'FundingPips';
  $('#accountModalName').value = '';
  $('#accountModalCapital').value = '100000';
  $('#accountModalCurrency').value = 'USD';
  $('#accountModalPhase').value = 'Challenge';
  $('#accountModalTarget').value = '10';
  $('#accountModalDailyLoss').value = '5';
  $('#accountModalDrawdown').value = '10';
  $('#accountModal').classList.remove('hidden');
  $('#accountModalFirm').focus();
}

function closeAccountModal() {
  $('#accountModal').classList.add('hidden');
}

async function createAccount(event) {
  event?.preventDefault();
  const firm = $('#accountModalFirm').value.trim();
  const name = $('#accountModalName').value.trim();

  if (!firm) {
    toast(t('accountModal.firmRequired'), 'warn');
    $('#accountModalFirm').focus();
    return;
  }
  if (!name) {
    toast(t('accountModal.nameRequired'), 'warn');
    $('#accountModalName').focus();
    return;
  }

  const capital = Number($('#accountModalCapital').value || 0);
  const nextState = await runBusy(t('ui.loading'), () => cisd.saveAccount({
    firm,
    name,
    capital,
    currentBalance: capital,
    currency: $('#accountModalCurrency').value,
    phase: $('#accountModalPhase').value,
    profitTarget: Number($('#accountModalTarget').value || 0),
    dailyLoss: Number($('#accountModalDailyLoss').value || 0),
    maxDrawdown: Number($('#accountModalDrawdown').value || 0),
  }));

  model.state = nextState;
  model.accountId = visibleAccounts().slice(-1)[0]?.id || model.accountId;
  closeAccountModal();
  persistUiState();
  await refreshFundingAccess();
  await refreshSnapshots();
  render();
  toast(t('accountModal.created'), 'success');
}

async function chooseTerminal() {
  const result = await runBusy(t('ui.loading'), () => cisd.chooseTerminal(model.accountId));
  if (!result.cancelled) {
    await refreshStateAndRender();
    toast(t('messages.terminalSaved'), 'success');
  }
}

async function openTerminal() {
  try {
    const result = await cisd.openTerminal(model.accountId);
    if (result) toast(result, 'info');
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function chooseCsv() {
  await runBusy(t('ui.loading'), () => cisd.chooseCSV());
  await refreshStateAndRender();
  toast(t('messages.csvChosen'), 'success');
}

async function importMt5() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.importMT5(model.accountId));
    if (!result.cancelled) {
      await refreshStateAndRender();
      toast(`${t('messages.mt5Imported')} ${result.added}`, 'success');
    }
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function importFundedNext() {
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.importFundedNext(model.accountId));
    if (!result.cancelled) {
      await refreshStateAndRender();
      toast(`${t('messages.fundedNextImported')} ${result.added}`, 'success');
    }
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function watchFundedNext() {
  const result = await runBusy(t('ui.loading'), () => cisd.watchFundedNext(model.accountId));
  if (!result.cancelled) {
    await refreshStateAndRender();
    toast(t('messages.fundedNextWatchEnabled'), 'success');
  }
}

function renderChartSlots() {
  for (const slot of ['before', 'after']) {
    const key = slot === 'before' ? 'beforeImage' : 'afterImage';
    const value = model.tradeCharts[key];
    const cap = slot === 'before' ? 'Before' : 'After';
    const preview = $(`#tradeChart${cap}Preview`);
    preview.innerHTML = value
      ? `<img src="${escapeHtml(`file://${value}`)}" alt="">`
      : `<span class="chart-slot-empty">${escapeHtml(t('journal.charts.empty'))}</span>`;
    $(`#tradeChart${cap}Clear`).classList.toggle('hidden', !value);
  }
}

async function attachTradeChart(slot) {
  try {
    const filePath = await cisd.chooseImage();
    if (!filePath) return;
    model.tradeCharts[slot === 'before' ? 'beforeImage' : 'afterImage'] = filePath;
    renderChartSlots();
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

function clearTradeChart(slot) {
  model.tradeCharts[slot === 'before' ? 'beforeImage' : 'afterImage'] = '';
  renderChartSlots();
}

async function exportTrades() {
  const account = activeAccount();
  if (!account) return;
  const hasTrades = (model.state?.trades || []).some((trade) => trade.accountId === account.id);
  if (!hasTrades) {
    toast(t('journal.exportEmpty'), 'warn');
    return;
  }
  try {
    const filePath = await runBusy(t('ui.loading'), () => cisd.exportTrades(account.id));
    if (filePath) toast(t('journal.exported'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function resetCurrentAccount() {
  const account = activeAccount();
  if (!account) return;
  const ok = await openConfirm({
    title: t('settings.resetConfirmTitle'),
    text: t('settings.resetConfirmText'),
    confirmLabel: t('settings.resetAccount'),
    typeToConfirm: 'RESET',
  });
  if (!ok) return;
  try {
    model.state = await runBusy(t('ui.loading'), () => cisd.resetAccount(account.id));
    await refreshSnapshots();
    render();
    toast(t('settings.resetDone'), 'success');
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function backupData() {
  const path = await runBusy(t('ui.loading'), () => cisd.backup());
  if (path) toast(t('messages.backupSaved'), 'success');
}

async function restoreData() {
  const ok = await openConfirm({
    title: t('settings.restore'),
    text: t('settings.restoreConfirm'),
    confirmLabel: t('settings.restore'),
  });
  if (!ok) return;
  try {
    const result = await runBusy(t('ui.loading'), () => cisd.restore());
    if (!result.cancelled) {
      await refreshStateAndRender();
      toast(t('messages.backupRestored'), 'success');
    }
  } catch (error) {
    toast(`${t('ui.error')}: ${error.message}`, 'error');
  }
}

async function openGuide() {
  const result = await cisd.openGuide();
  if (result) toast(result, 'info');
}

async function restartOnboarding() {
  model.state = await runBusy(t('ui.loading'), () => cisd.resetOnboarding());
  render();
  toast(t('messages.onboardingRestarted'), 'success');
}

async function updateFilters() {
  model.filters.period = $('#filterPeriod').value;
  model.filters.source = $('#filterSource').value;
  model.filters.instrument = $('#filterInstrument').value;
  model.filters.side = $('#filterSide').value;
  model.filters.session = $('#filterSession').value;
  persistUiState();
  await refreshSnapshots();
  render();
}

function fillPeriodOptions() {
  $('#filterPeriod').innerHTML = [
    ['all', t('analytics.filters.allTime')],
    ['today', t('analytics.filters.today')],
    ['week', t('analytics.filters.week')],
    ['month', t('analytics.filters.month')],
  ].map(([value, label]) => `<option value="${value}">${escapeHtml(label)}</option>`).join('');
  $('#filterPeriod').value = model.filters.period;
}

function bindEvents() {
  $('#minimizeBtn').onclick = () => cisd.minimize();
  $('#maximizeBtn').onclick = () => cisd.maximize();
  $('#closeBtn').onclick = () => cisd.close();
  $('#newAccountBtn').onclick = openAccountModal;
  $('#accountModalForm').addEventListener('submit', createAccount);
  $('#cancelAccountModal').onclick = closeAccountModal;
  $('#closeAccountModal').onclick = closeAccountModal;
  $('#accountModal').addEventListener('click', (event) => {
    if (event.target.id === 'accountModal') closeAccountModal();
  });

  $('#quickStartDismiss').onclick = () => {
    model.quickStartDismissed = true;
    persistUiState();
    renderQuickStart();
  };

  $('#exportTradesBtn').onclick = exportTrades;
  $('#resetAccountBtn').onclick = resetCurrentAccount;
  $('#tradeChartBeforeBtn').onclick = () => attachTradeChart('before');
  $('#tradeChartAfterBtn').onclick = () => attachTradeChart('after');
  $('#tradeChartBeforeClear').onclick = () => clearTradeChart('before');
  $('#tradeChartAfterClear').onclick = () => clearTradeChart('after');

  $$('.nav-link').forEach((button) => {
    button.onclick = () => {
      model.page = button.dataset.page;
      persistUiState();
      renderActivePage();
      renderWorkspaceStatus();
    };
  });

  $('#overviewOpenTerminal').onclick = openTerminal;
  $('#overviewLoadNews').onclick = () => loadNews(false);
  $('#overviewGoSignals').onclick = () => {
    model.page = 'signals';
    persistUiState();
    renderActivePage();
    renderWorkspaceStatus();
  };

  $('#chooseCsvBtn').onclick = chooseCsv;
  $('#refreshSnapshotsBtn').onclick = async () => {
    await refreshStateAndRender();
    toast(t('messages.refreshed'), 'success');
  };

  $('#tradeForm').addEventListener('submit', saveTrade);
  $('#backtestForm').addEventListener('submit', startBacktest);
  $('#accountSettingsForm').addEventListener('submit', saveAccountSettings);
  $('#journalGuidanceBackBtn').onclick = () => {
    model.page = 'signals';
    persistUiState();
    renderActivePage();
    renderWorkspaceStatus();
  };
  $('#journalGuidanceClearBtn').onclick = () => {
    clearJournalGuidance();
    $('#tradeForm')?.reset();
    $('#tradeDate').value = todayKey();
    renderJournal();
  };
  $('#fundingAccessModeInput').addEventListener('change', toggleFundingAccessFields);
  $('#saveFundingAccessBtn').onclick = saveFundingAccess;
  $('#syncFundingAccessBtn').onclick = syncFundingAccessNow;
  $('#openFundingAccessBtn').onclick = openFundingAccess;
  $('#signalsSearch').addEventListener('input', () => { model.search.signals = $('#signalsSearch').value; persistUiState(); renderSignalsPage(); });
  $('#journalSearch').addEventListener('input', () => { model.search.journal = $('#journalSearch').value; persistUiState(); renderJournal(); });
  $('#backtestSearch').addEventListener('input', () => { model.search.backtest = $('#backtestSearch').value; persistUiState(); renderBacktest(); });
  $('#tradeSignal').addEventListener('change', () => {
    const signalId = $('#tradeSignal').value;
    const signal = (model.state?.signals || []).find((item) => item.SignalID === signalId);
    if (signal) hydrateTradeForm(signal);
  });

  $('#importMt5Btn').onclick = importMt5;
  $('#importFundedNextBtn').onclick = importFundedNext;
  $('#watchFundedNextBtn').onclick = watchFundedNext;

  $('#savePreferencesBtn').onclick = savePreferences;
  $('#chooseTerminalBtn').onclick = chooseTerminal;
  $('#openTerminalBtn').onclick = openTerminal;
  $('#saveNewsSettingsBtn').onclick = saveNewsSettings;
  $('#testNewsBtn').onclick = () => loadNews(false);
  $('#backupBtn').onclick = backupData;
  $('#restoreBtn').onclick = restoreData;
  $('#openGuideBtn').onclick = openGuide;
  $('#restartOnboardingBtn').onclick = restartOnboarding;

  $('#closeReasonModal').onclick = closeReasonModal;
  $('#saveReasonBtn').onclick = saveReason;
  $('#reasonModal').addEventListener('click', (event) => {
    if (event.target.id === 'reasonModal') closeReasonModal();
  });
  $('#closeBacktestReviewModal').onclick = closeBacktestReviewModal;
  $('#saveBacktestReviewBtn').onclick = saveBacktestReviewFromModal;
  $('#backtestReviewModal').addEventListener('click', (event) => {
    if (event.target.id === 'backtestReviewModal') closeBacktestReviewModal();
  });

  ['#filterPeriod', '#filterSource', '#filterInstrument', '#filterSide', '#filterSession'].forEach((selector) => {
    $(selector).addEventListener('change', updateFilters);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    if (!$('#accountModal').classList.contains('hidden')) closeAccountModal();
    if (model.reasonSignalId) closeReasonModal();
    if (model.backtestReviewSignalId) closeBacktestReviewModal();
  });
}

async function init() {
  restoreUiState();
  model.bundle = await cisd.localeBundle();
  fillPeriodOptions();
  bindEvents();
  await refreshStateAndRender();
  if (model.newsConfigured) await loadNews(true);
  render();
  setInterval(() => {
    if (!model.state) return;
    renderWorkspaceStatus();
    const account = activeAccount();
    if (account && model.dashboard) renderOverviewHero(account, model.dashboard);
  }, 60000);

  cisd.onChange(async (state) => {
    const previousSignalCount = model.state?.signals?.length || 0;
    model.state = state;
    ensureAccount();
    model.newsConfigured = (await cisd.newsStatus()).configured;
    await refreshSnapshots();
    render();
    if ((state.signals?.length || 0) > previousSignalCount) toast(t('messages.newSignalArrived'), 'info');
  });
}

init().catch((error) => {
  console.error(error);
  toast(`${t('ui.error')}: ${error.message}`, 'error');
});
