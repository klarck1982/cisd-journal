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
  calendar: null,
  calendarMonth: null,
  dailyDraft: { mood: '' },
  // Empty means today; set from the calendar when reviewing an earlier day.
  dailyDay: '',
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
  editingTradeId: null,
  editingPlaybookId: null,
  welcomeStep: 0,
  welcomeCsvPath: '',
  backtestCsvPath: '',
  dashboardDensity: 'compact',
  signalsView: 'pending',
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
      signalsView: model.signalsView,
      quickStartDismissed: model.quickStartDismissed,
      calendarMonth: model.calendarMonth,
      dailyDay: model.dailyDay,
      dashboardDensity: model.dashboardDensity,
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
    if (saved.signalsView) model.signalsView = saved.signalsView;
    if (saved.quickStartDismissed) model.quickStartDismissed = true;
    if (saved.calendarMonth) model.calendarMonth = saved.calendarMonth;
    if (saved.dailyDay) model.dailyDay = saved.dailyDay;
    if (saved.dashboardDensity) model.dashboardDensity = saved.dashboardDensity;
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

function navLabelForPage(page) {
  const map = {
    overview: t('nav.overview'),
    signals: t('nav.signals'),
    journal: t('nav.journal'),
    backtest: t('nav.backtest'),
    daily: t('nav.daily'),
    calendar: t('nav.calendar'),
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

/**
 * Renders a list, falling back to a guided empty state when there is nothing to show.
 * `empty` may be a ui.empty key, optionally with an action id, so each list can explain
 * itself instead of all of them saying "No data yet".
 */
function renderListRows(items, formatter, empty = null) {
  if (items.length) return items.map(formatter).join('');
  if (!empty) return emptyState(t('ui.empty.noData'));
  if (typeof empty === 'string') return guidedEmpty(empty);
  return guidedEmpty(empty.key, empty.action);
}
