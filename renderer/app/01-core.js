/**
 * Application state, i18n, formatting and small shared helpers.
 * Loaded first: everything below depends on `model`, `t()` and the formatters.
 */

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

const model = {
  state: null,
  bundle: null,
  accountId: null,
  dashboard: null,
  analytics: null,
  edge: null,
  playbooks: null,
  daily: null,
  dailyDraft: { mood: '' },
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
    daily: t('nav.daily'),
    playbooks: t('nav.playbooks'),
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
