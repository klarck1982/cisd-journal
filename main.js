const { app, BrowserWindow, ipcMain, dialog, safeStorage, Notification, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { promisify } = require('util');

const { createStore } = require('./lib/store');
const { fetchCalendar } = require('./lib/news-providers');
const { importFundedNextText, importMT5Text, importCisdSignalsText, importBacktestSignalsText } = require('./lib/import-engine');
const { buildAccountDashboardSnapshot } = require('./lib/engines/account-dashboard');
const { buildAccountAnalyticsSnapshot } = require('./lib/engines/analytics');
const { buildEdgeSnapshot } = require('./lib/engines/edge');
const { createPlaybook, buildPlaybookOverview } = require('./lib/engines/playbooks');
const { buildDailyReviewSnapshot } = require('./lib/engines/daily-review');
const { buildMonthCalendar, listTradedMonths } = require('./lib/engines/calendar');
const { buildExitQualitySnapshot } = require('./lib/engines/exit-quality');
const { resolveLocale, getBundle } = require('./lib/locale');
const { resolveFundingAccessMode, validateFundingAccess, buildFundingAccessView } = require('./lib/funding-access');
const { parseFundingPipsSharedText } = require('./lib/funding-shared-parser');
const { applyInvestorPassSnapshot } = require('./lib/investor-pass-sync');
const { resolveMt5BridgeCandidates } = require('./lib/mt5-bridge');
const { buildRuntimeReadinessSnapshot } = require('./lib/runtime-readiness');

let win = null;
let signalWatchPath = null;
let signalsInitialized = false;
let newsCache = [];
const fundedNextWatchers = {};

const store = createStore(app);
const { dataFile, initial, logError, read, save } = store;
const execFileAsync = promisify(execFile);

function secretFile() {
  return path.join(app.getPath('userData'), 'news-api-key.bin');
}

function accountSecretFile(accountId, kind) {
  return path.join(app.getPath('userData'), `${kind}-${accountId}.bin`);
}

function sendStateChanged(state) {
  win?.webContents.send('state:changed', state);
}

function ensureAccount(data, accountId) {
  const account = data.accounts.find((item) => item.id === accountId);
  if (!account) throw new Error(getBundle(data.settings?.locale).errors.accountNotFound);
  return account;
}

/**
 * Import/provider modules throw errors carrying a stable `code`. Translate it here so the
 * user reads the message in their selected language instead of a hardcoded string.
 */
function localizeError(error, locale) {
  if (error && error.code) {
    const translated = getBundle(locale).errors?.[error.code];
    if (translated) return new Error(translated);
  }
  return error;
}

function ensureCsvPath(data) {
  if (!data.settings?.csvPath || !fs.existsSync(data.settings.csvPath)) {
    throw new Error(getBundle(data.settings?.locale).errors.csvPathMissing || 'CISD CSV path is missing');
  }
  return data.settings.csvPath;
}

function isImportCandidate(fileName) {
  return Boolean(fileName && /\.(csv|txt)$/i.test(fileName));
}

function importFundedNextFile(filePath, accountId, options = {}) {
  const data = read();
  try {
    const result = importFundedNextText(data, fs.readFileSync(filePath, 'utf8'), accountId, path.basename(filePath), options);
    save(data);
    return { state: data, ...result };
  } catch (error) {
    throw localizeError(error, data.settings?.locale);
  }
}

function importMT5File(filePath, accountId, options = {}) {
  const data = read();
  try {
    const result = importMT5Text(data, fs.readFileSync(filePath, 'utf8'), accountId, path.basename(filePath), /\.html?$/i.test(filePath), options);
    save(data);
    return { state: data, ...result };
  } catch (error) {
    throw localizeError(error, data.settings?.locale);
  }
}

function importBacktestSessionSignals(backtestId, options = {}) {
  const data = read();
  const backtest = data.backtests.find((item) => item.id === backtestId);
  if (!backtest) throw new Error(getBundle(data.settings?.locale).errors.backtestNotFound || 'Backtest not found');
  // يدعم مسار مخصص للباكتيست (ملف Replay من JForex) - هذا ما طلبه المستخدم:
  // فترة الباكتيست كتاريخ تطابق فترة الباكتيست على JForex
  let csvPath = backtest.sourceCsvPath || backtest.backtestCsvPath || '';
  if (csvPath && fs.existsSync(csvPath)) {
    // استخدم المسار المخصص للباكتيست
  } else {
    csvPath = ensureCsvPath(data);
  }
  const result = importBacktestSignalsText(data, fs.readFileSync(csvPath, 'utf8'), backtest, csvPath, options);
  backtest.lastImportedAt = new Date().toISOString();
  backtest.lastDiagnostics = result.diagnostics;
  if (!backtest.sourceCsvPath) backtest.sourceCsvPath = csvPath;
  save(data);
  return { state: data, ...result };
}

function syncSignalsFromFile() {
  const data = read();

  try {
    if (!data.settings.csvPath || !fs.existsSync(data.settings.csvPath)) {
      sendStateChanged(data);
      return;
    }

    const csvText = fs.readFileSync(data.settings.csvPath, 'utf8');
    const { added, count } = importCisdSignalsText(data, csvText, data.settings.csvPath, {
      recordNoop: false,
    });
    save(data);

    if (signalsInitialized && count > 0 && data.settings.notifications !== false) {
      const bundle = getBundle(data.settings.locale);
      const signal = added[0];
      const body = bundle.notifications.newSignalBody
        .replace('{{instrument}}', signal.Instrument || '')
        .replace('{{direction}}', signal.Direction || '')
        .replace('{{timeframe}}', signal.TF || '')
        .replace('{{session}}', signal.Session || '');

      new Notification({
        title: bundle.notifications.newSignalTitle,
        body,
      }).show();
    }

    signalsInitialized = true;
    sendStateChanged(data);
  } catch (error) {
    logError('syncSignalsFromFile', error);
  }
}

function watchSignalsFile() {
  if (signalWatchPath) fs.unwatchFile(signalWatchPath);
  signalWatchPath = read().settings.csvPath;
  if (signalWatchPath) fs.watchFile(signalWatchPath, { interval: 2000 }, syncSignalsFromFile);
  syncSignalsFromFile();
}

/**
 * Desktop notifications for risk-limit warnings.
 *
 * The risk engine already produced NEAR_DAILY_LOSS_LIMIT / *_BREACHED codes, but
 * nothing ever told the trader — the warning was only visible to someone already
 * looking at the Overview page. A discipline guard has to interrupt.
 *
 * State is kept per account+code so a breach notifies once rather than on every
 * snapshot, and re-arms only after the account returns to a safe state.
 */
const notifiedRiskCodes = new Map();

function notifyRiskWarnings(data, accountId, snapshot) {
  if (!snapshot || data.settings?.notifications === false) return;
  if (!Notification.isSupported || !Notification.isSupported()) return;

  const bundle = getBundle(data.settings?.locale);
  const account = (data.accounts || []).find((item) => item.id === accountId);
  const previous = notifiedRiskCodes.get(accountId) || new Set();
  const current = new Set();

  const messages = {
    NEAR_DAILY_LOSS_LIMIT: bundle.alerts?.nearDailyLoss,
    DAILY_LOSS_LIMIT_BREACHED: bundle.alerts?.dailyLossBreached,
    NEAR_MAX_DRAWDOWN: bundle.alerts?.nearDrawdown,
    MAX_DRAWDOWN_BREACHED: bundle.alerts?.drawdownBreached,
  };

  for (const warning of snapshot.warnings || []) {
    current.add(warning.code);
    const template = messages[warning.code];
    if (!template || previous.has(warning.code)) continue;

    const remaining = Number.isFinite(warning.remaining) ? Math.round(warning.remaining).toLocaleString('en-US') : '';
    try {
      new Notification({
        title: `${bundle.alerts?.title || 'Risk alert'} — ${account?.name || ''}`.trim(),
        body: String(template).replace('{{remaining}}', remaining),
        urgency: warning.severity === 'critical' ? 'critical' : 'normal',
      }).show();
    } catch (error) {
      logError('notifyRiskWarnings', error);
    }
  }

  notifiedRiskCodes.set(accountId, current);
}

function closeFundedNextWatcher(accountId) {
  if (!fundedNextWatchers[accountId]) return;
  try {
    fundedNextWatchers[accountId].close();
  } catch (error) {
    logError('closeFundedNextWatcher', error);
  }
  delete fundedNextWatchers[accountId];
}

function watchFundedNextFolder(accountId, folder) {
  closeFundedNextWatcher(accountId);
  if (!folder || !fs.existsSync(folder)) return;

  fundedNextWatchers[accountId] = fs.watch(folder, (eventType, fileName) => {
    if (!isImportCandidate(fileName)) return;
    setTimeout(() => {
      try {
        const result = importFundedNextFile(path.join(folder, fileName), accountId, { recordNoop: false });
        if (result.added) sendStateChanged(result.state);
      } catch (error) {
        logError('watchFundedNextFolder:event', error);
      }
    }, 700);
  });

  for (const fileName of fs.readdirSync(folder)) {
    if (!isImportCandidate(fileName)) continue;
    try {
      importFundedNextFile(path.join(folder, fileName), accountId, { recordNoop: false });
    } catch (error) {
      logError('watchFundedNextFolder:bootstrap', error);
    }
  }
}

function watchAllFundedNextFolders() {
  for (const account of read().accounts) {
    if (account.fundedNextFolder) watchFundedNextFolder(account.id, account.fundedNextFolder);
  }
}

function newsKey() {
  try {
    const encrypted = fs.readFileSync(secretFile());
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(encrypted) : encrypted.toString();
  } catch {
    return '';
  }
}

function setNewsKey(value) {
  if (!value) {
    try {
      fs.unlinkSync(secretFile());
    } catch {}
    return;
  }

  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(value)
    : Buffer.from(value);

  fs.writeFileSync(secretFile(), payload);
}

function readEncryptedSecret(filePath) {
  try {
    const encrypted = fs.readFileSync(filePath);
    return safeStorage.isEncryptionAvailable() ? safeStorage.decryptString(encrypted) : encrypted.toString();
  } catch {
    return '';
  }
}

function writeEncryptedSecret(filePath, value) {
  if (!value) {
    try { fs.unlinkSync(filePath); } catch {}
    return;
  }
  const payload = safeStorage.isEncryptionAvailable() ? safeStorage.encryptString(value) : Buffer.from(value);
  fs.writeFileSync(filePath, payload);
}

function getFundingAccessStatus(data, accountId) {
  const account = ensureAccount(data, accountId);
  return buildFundingAccessView(account, {
    hasStoredPassword: !!readEncryptedSecret(accountSecretFile(accountId, 'investor-pass')),
  });
}

async function loadSharedDashboardContent(url) {
  const scraper = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      javascript: true,
    },
  });

  try {
    await scraper.loadURL(url, {
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    });

    const started = Date.now();
    while (Date.now() - started < 18000) {
      const payload = await scraper.webContents.executeJavaScript(`(() => ({ title: document.title || '', text: document.body?.innerText || '', tables: [...document.querySelectorAll('table')].map(table => [...table.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('th,td')].map(td => (td.innerText || '').trim())) ) }))()`);
      if (payload?.text && /Trading Account|Account Size|Today's Profit|Balance/i.test(payload.text) && !/Security Checkpoint/i.test(payload.title || '')) {
        return payload;
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }

    throw new Error('Shared dashboard content did not become available in time');
  } finally {
    if (!scraper.isDestroyed()) scraper.destroy();
  }
}

async function runMt5ReadonlyBridge(payload) {
  const plan = resolveMt5BridgeCandidates({
    app,
    isPackaged: app.isPackaged,
    currentDirname: __dirname,
    platform: process.platform,
    preferExecutable: true,
  });

  let lastError = null;
  for (const candidate of plan.candidates) {
    try {
      const args = [...candidate.args, JSON.stringify(payload)];
      const { stdout } = await execFileAsync(candidate.command, args, {
        timeout: 90000,
        maxBuffer: 8 * 1024 * 1024,
        windowsHide: true,
      });
      const parsed = JSON.parse(stdout || '{}');
      if (!parsed.ok) throw new Error(parsed.error || 'Unknown MT5 bridge error');
      return parsed;
    } catch (error) {
      lastError = error;
    }
  }

  const fallback = app.isPackaged
    ? 'Bundled MT5 bridge EXE was not found or failed to run. Build/ship bridges/mt5_readonly_sync.exe with the desktop app.'
    : 'MT5 readonly bridge could not run. Build the helper EXE or make Python + MetaTrader5 available.';
  throw lastError || new Error(fallback);
}

async function syncFundingAccess(accountId) {
  const data = read();
  const account = ensureAccount(data, accountId);
  const access = getFundingAccessStatus(data, accountId);

  try {
    if (access.mode === 'shared_url') {
      if (!access.sharedDashboardUrl) throw new Error(getBundle(data.settings.locale).errors.fundingUrlMissing);
      const payload = await loadSharedDashboardContent(access.sharedDashboardUrl);
      const snapshot = parseFundingPipsSharedText(payload.text, payload.tables);

      account.lastFundingSync = new Date().toISOString();
      account.lastFundingSource = 'FundingPips Shared Dashboard';
      account.lastFundingError = '';
      account.syncedAccountOwner = snapshot.owner || account.syncedAccountOwner || '';
      account.syncedTodayProfit = snapshot.todayProfit;
      account.syncedEquity = snapshot.equity;
      account.syncedEquityMax = snapshot.equityMax;
      account.syncedBalanceMax = snapshot.balanceMax;
      account.syncedScore = snapshot.score;
      account.syncedWinRatio = snapshot.winRatio;
      account.syncedProfitFactor = snapshot.profitFactor;
      account.syncedTotalTrades = snapshot.totalTrades;
      account.syncedAverageWin = snapshot.averageWin;
      account.syncedAverageLoss = snapshot.averageLoss;
      account.syncedBiggestWin = snapshot.biggestWin;
      account.syncedBiggestLoss = snapshot.biggestLoss;
      account.syncedFundingSnapshot = snapshot;
      if (!account.capital && snapshot.accountSize) account.capital = snapshot.accountSize;
      if (snapshot.balance !== null && snapshot.balance !== undefined) account.currentBalance = snapshot.balance;
      if (!account.phase && snapshot.phase) account.phase = snapshot.phase;

      save(data);
      return { state: data, snapshot, fundingAccess: getFundingAccessStatus(data, accountId) };
    }

    if (access.mode === 'investor_pass') {
      const password = readEncryptedSecret(accountSecretFile(accountId, 'investor-pass'));
      const bridgeResult = await runMt5ReadonlyBridge({
        login: access.investorLogin,
        server: access.investorServer,
        password,
        terminalPath: account.terminalPath || '',
        syncScope: access.syncScope,
        historyDays: 21,
      });

      const applied = applyInvestorPassSnapshot(data, accountId, bridgeResult, { syncScope: access.syncScope });
      account.lastFundingError = '';
      save(data);
      return {
        state: data,
        snapshot: account.syncedFundingSnapshot,
        fundingAccess: getFundingAccessStatus(data, accountId),
        bridge: {
          positions: applied.openPositions.length,
          addedTrades: applied.addedTrades,
        },
      };
    }

    throw new Error(getBundle(data.settings.locale).errors.fundingAccessMissing || 'No funding access is configured');
  } catch (error) {
    account.lastFundingError = error.message;
    save(data);
    throw error;
  }
}

async function fetchNews() {
  const data = read();
  try {
    newsCache = await fetchCalendar(data.settings.newsProvider || 'FMP', newsKey());
    if (win) win.webContents.send('news:updated', newsCache);
    return newsCache;
  } catch (error) {
    throw localizeError(error, data.settings?.locale);
  }
}

function scheduleNewsAutoFetch() {
  const attempt = async () => {
    try {
      const data = read();
      const provider = data.settings?.newsProvider || 'FMP';
      // FREE provider يعمل بدون مفتاح - هذا هو الحل لمشكلة FMP المجاني الذي لا يدعم التقويم
      if (provider !== 'FREE' && !newsKey()) return;
      await fetchNews();
    } catch (e) {
      logError('news:autoFetch', e);
    }
  };
  // Fetch shortly after startup if configured, then hourly
  setTimeout(attempt, 4000);
  setInterval(attempt, 60 * 60 * 1000);
}

function validateRestorePayload(payload, locale) {
  if (!payload || typeof payload !== 'object') throw new Error(getBundle(locale).errors.invalidBackup);
  if (!Array.isArray(payload.accounts) || !Array.isArray(payload.trades)) {
    throw new Error(getBundle(locale).errors.invalidBackup);
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    frame: false,
    backgroundColor: '#09111d',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
    },
  });

  // A local-first journal must never navigate itself away from the bundled UI,
  // and must never open arbitrary child windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:$/.test(new URL(url).protocol)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    if (url !== win.webContents.getURL()) event.preventDefault();
  });

  win.loadFile('renderer/index.html');
}

function updateSettings(patch) {
  const data = read();
  const normalizedPatch = { ...patch };
  if ('locale' in normalizedPatch) normalizedPatch.locale = resolveLocale(normalizedPatch.locale);
  data.settings = { ...data.settings, ...normalizedPatch };
  save(data);
  return data;
}

function registerHandlers() {
  ipcMain.handle('state:get', () => read());
  ipcMain.handle('runtime:readiness', () => buildRuntimeReadinessSnapshot({ app, isPackaged: app.isPackaged, currentDirname: __dirname, platform: process.platform }));
  ipcMain.handle('dashboard:snapshot', (_, accountId, options = {}) => {
    const data = read();
    const snapshot = buildAccountDashboardSnapshot(data, accountId, options);
    notifyRiskWarnings(data, accountId, snapshot.risk);
    return snapshot;
  });
  ipcMain.handle('analytics:snapshot', (_, accountId, options = {}) => buildAccountAnalyticsSnapshot(read(), accountId, options));
  ipcMain.handle('calendar:month', (_, accountId, options = {}) => {
    const data = read();
    return {
      calendar: buildMonthCalendar(data, accountId, options),
      months: listTradedMonths(data, accountId, options),
    };
  });

  ipcMain.handle('daily:snapshot', (_, accountId, options = {}) => buildDailyReviewSnapshot(read(), accountId, options));

  ipcMain.handle('playbooks:overview', (_, accountId, options = {}) => buildPlaybookOverview(read(), accountId, options));

  ipcMain.handle('playbook:save', (_, payload = {}) => {
    const data = read();
    data.playbooks = data.playbooks || [];
    const index = data.playbooks.findIndex((item) => item.id === payload.id);

    if (index >= 0) {
      const merged = createPlaybook({ ...data.playbooks[index], ...payload, id: data.playbooks[index].id });
      merged.createdAt = data.playbooks[index].createdAt;
      data.playbooks[index] = merged;
    } else {
      data.playbooks.push(createPlaybook(payload));
    }

    save(data);
    return data;
  });

  ipcMain.handle('playbook:delete', (_, id) => {
    const data = read();
    data.playbooks = (data.playbooks || []).filter((item) => item.id !== id);
    // Unlink trades so they are not orphaned against a playbook that no longer exists.
    for (const trade of data.trades || []) {
      if (trade.playbookId === id) {
        delete trade.playbookId;
        delete trade.followedRules;
      }
    }
    save(data);
    return data;
  });

  ipcMain.handle('edge:snapshot', (_, accountId, options = {}) => {
    const data = read();
    const risk = buildAccountDashboardSnapshot(data, accountId, options).risk;
    return {
      ...buildEdgeSnapshot(data, accountId, { ...options, risk }),
      exitQuality: buildExitQualitySnapshot(data, accountId, options),
    };
  });
  ipcMain.handle('locale:bundle', () => getBundle(read().settings.locale));
  ipcMain.handle('settings:update', (_, patch) => updateSettings(patch));
  ipcMain.handle('onboarding:reset', () => {
    const data = read();
    data.settings.onboardingComplete = false;
    save(data);
    return data;
  });
  ipcMain.handle('help:open-guide', () => {
    const guidePath = app.isPackaged
      ? path.join(process.resourcesPath, 'docs', 'CISD_Journal_User_Guide.html')
      : path.join(__dirname, 'docs', 'CISD_Journal_User_Guide.html');
    return shell.openPath(guidePath);
  });
  ipcMain.handle('onboarding:complete', () => {
    const data = read();
    data.settings.onboardingComplete = true;
    save(data);
    return data;
  });

  ipcMain.handle('news:status', () => {
    const data = read();
    const provider = data.settings?.newsProvider || 'FMP';
    const isFree = provider === 'FREE';
    return { configured: isFree || !!newsKey(), count: newsCache.length, provider };
  });
  ipcMain.handle('news:provider', (_, provider) => {
    const data = read();
    data.settings.newsProvider = provider;
    save(data);
    return data.settings;
  });
  ipcMain.handle('news:key', (_, key) => {
    setNewsKey(key);
    return { configured: !!newsKey() };
  });
  ipcMain.handle('news:fetch', async () => fetchNews());

  ipcMain.handle('image:choose', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Chart Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }],
    });
    if (result.canceled) return '';

    const chartsDir = path.join(app.getPath('userData'), 'charts');
    fs.mkdirSync(chartsDir, { recursive: true });
    const extension = path.extname(result.filePaths[0]);
    const destination = path.join(chartsDir, `${crypto.randomUUID()}${extension}`);
    fs.copyFileSync(result.filePaths[0], destination);
    return destination;
  });

  ipcMain.handle('terminal:choose', async (_, accountId) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'MT5 Terminal or Shortcut', extensions: ['exe', 'lnk'] }],
    });
    if (result.canceled) return { cancelled: true };

    const data = read();
    const account = ensureAccount(data, accountId);
    account.terminalPath = result.filePaths[0];
    save(data);
    return { state: data, path: account.terminalPath };
  });

  ipcMain.handle('terminal:open', (_, accountId) => {
    const data = read();
    const account = ensureAccount(data, accountId);
    if (!account.terminalPath) throw new Error(getBundle(data.settings.locale).errors.terminalNotSelected);
    return shell.openPath(account.terminalPath);
  });

  ipcMain.handle('funding:access:get', (_, accountId) => {
    const data = read();
    return getFundingAccessStatus(data, accountId);
  });

  ipcMain.handle('funding:access:save', (_, accountId, payload = {}) => {
    const data = read();
    const account = ensureAccount(data, accountId);
    const validation = validateFundingAccess({
      ...payload,
      hasStoredPassword: !!readEncryptedSecret(accountSecretFile(accountId, 'investor-pass')),
    });
    if (!validation.valid) throw new Error(getBundle(data.settings.locale).errors[validation.code] || validation.code);

    account.fundingAccessMode = resolveFundingAccessMode(payload.mode);
    account.fundingSyncScope = payload.syncScope || account.fundingSyncScope || 'full_readonly';
    account.investorLogin = String(payload.investorLogin || '').trim();
    account.investorServer = String(payload.investorServer || '').trim();
    account.sharedDashboardUrl = String(payload.sharedDashboardUrl || '').trim();

    if (account.sharedDashboardUrl) {
      const parsed = new URL(account.sharedDashboardUrl);
      if (parsed.protocol !== 'https:') throw new Error(getBundle(data.settings.locale).errors.httpsOnly);
    }

    if (String(payload.investorPassword || '').trim()) {
      writeEncryptedSecret(accountSecretFile(accountId, 'investor-pass'), String(payload.investorPassword || '').trim());
    }

    save(data);
    return { state: data, fundingAccess: getFundingAccessStatus(data, accountId) };
  });

  ipcMain.handle('funding:access:sync', (_, accountId) => syncFundingAccess(accountId));

  ipcMain.handle('funding:open', (_, accountId) => {
    const data = read();
    const account = ensureAccount(data, accountId);
    if (!account.sharedDashboardUrl) throw new Error(getBundle(data.settings.locale).errors.fundingUrlMissing);
    return shell.openExternal(account.sharedDashboardUrl);
  });

  ipcMain.handle('data:restore', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'CISD Journal Backup', extensions: ['json'] }],
    });
    if (result.canceled) return { cancelled: true };

    const payload = JSON.parse(fs.readFileSync(result.filePaths[0], 'utf8'));
    const current = read();
    validateRestorePayload(payload, current.settings.locale);

    fs.writeFileSync(`${dataFile()}.before-restore-${Date.now()}`, JSON.stringify(current, null, 2));
    save({
      ...initial(),
      ...payload,
      settings: {
        ...initial().settings,
        ...(payload.settings || {}),
        locale: resolveLocale(payload.settings?.locale || current.settings.locale),
      },
    });

    return { state: read(), file: result.filePaths[0] };
  });

  ipcMain.handle('trades:export', async (_, accountId) => {
    const data = read();
    const rows = data.trades.filter((item) => item.accountId === accountId);
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'CISD-Journal-Trades.csv',
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (result.canceled) return '';

    const columns = ['Ticket', 'Source', 'Symbol', 'Side', 'Open Time', 'Close Time', 'Entry', 'Close', 'SL', 'TP', 'Lots', 'Profit', 'Commission', 'Swap', 'Net P&L', 'Result R', 'Tags', 'Note'];
    const escapeCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const csvText = `${columns.join(',')}\n${rows
      .map((trade) => [
        trade.ticket || '',
        trade.source,
        trade.symbol,
        trade.side,
        trade.openTime || '',
        trade.closeTime || '',
        trade.entry || '',
        trade.close || '',
        trade.sl || '',
        trade.tp || '',
        trade.lots || '',
        trade.profit ?? '',
        trade.commission ?? '',
        trade.swap ?? '',
        trade.netProfit ?? '',
        trade.resultR ?? '',
        trade.tags || '',
        trade.note || '',
      ].map(escapeCell).join(','))
      .join('\n')}`;

    fs.writeFileSync(result.filePath, csvText);
    return result.filePath;
  });

  ipcMain.handle('data:backup', async () => {
    const result = await dialog.showSaveDialog(win, {
      defaultPath: 'CISD-Journal-Backup.json',
      filters: [{ name: 'JSON Backup', extensions: ['json'] }],
    });
    if (!result.canceled) fs.writeFileSync(result.filePath, JSON.stringify(read(), null, 2));
    return result.canceled ? '' : result.filePath;
  });

  /**
   * Clears the trading history of an account.
   *
   * Deliberately preserves profitTarget / dailyLoss / maxDrawdown / phase.
   * These are the account's risk configuration, not its history, and the
   * confirmation text only warns about trades, positions, backtests and notes.
   * Zeroing dailyLoss additionally made buildRiskSnapshot() return a null
   * dailyLossLimit, which silently disarms the guard the product exists to
   * provide. Clearing history must never disable protection.
   */
  ipcMain.handle('account:reset', (_, accountId) => {
    const data = read();
    data.trades = data.trades.filter((item) => item.accountId !== accountId);
    data.openPositions = (data.openPositions || []).filter((item) => item.accountId !== accountId);

    // Backtest sessions are a separate simulation centre. Resetting a real
    // account must never remove a trader's research or virtual capital.
    data.daily = data.daily.filter((item) => item.accountId !== accountId);

    const account = data.accounts.find((item) => item.id === accountId);
    if (account) {
      // Balance returns to the starting capital because the history that moved
      // it away is gone. Risk limits and phase are configuration and stay.
      account.currentBalance = account.capital;
    }

    save(data);
    return data;
  });

  ipcMain.handle('account:save', (_, accountPayload) => {
    const data = read();
    const index = data.accounts.findIndex((item) => item.id === accountPayload.id);

    if (index >= 0) {
      data.accounts[index] = { ...data.accounts[index], ...accountPayload };
    } else {
      data.accounts.push({
        ...accountPayload,
        id: accountPayload.id || crypto.randomUUID(),
        currentBalance: accountPayload.currentBalance || accountPayload.capital || 0,
        createdAt: new Date().toISOString(),
      });
    }

    save(data);
    return data;
  });

  ipcMain.handle('account:archive', (_, id) => {
    const data = read();
    const account = data.accounts.find((item) => item.id === id);
    if (account) account.archived = true;
    save(data);
    return data;
  });

  ipcMain.handle('account:unarchive', (_, id) => {
    const data = read();
    const account = data.accounts.find((item) => item.id === id);
    if (account) account.archived = false;
    save(data);
    return data;
  });

  /**
   * Permanently removes an account and everything belonging to it.
   *
   * Archiving hides an account but keeps its rows, which is the right default.
   * Deletion exists for the account created by mistake. It also stops the
   * folder watcher and removes the encrypted investor-pass secret, so no
   * orphaned watcher or credential file outlives the account.
   */
  ipcMain.handle('account:delete', (_, id) => {
    const data = read();
    const account = data.accounts.find((item) => item.id === id);
    if (!account) throw new Error(getBundle(data.settings?.locale).errors.accountNotFound);

    closeFundedNextWatcher(id);

    // Simulation sessions do not belong to a live account and survive account
    // deletion; this prevents research from being silently destroyed.
    data.trades = (data.trades || []).filter((item) => item.accountId !== id);
    data.openPositions = (data.openPositions || []).filter((item) => item.accountId !== id);
    data.daily = (data.daily || []).filter((item) => item.accountId !== id);
    data.playbooks = (data.playbooks || []).filter((item) => item.accountId !== id);
    data.importHistory = (data.importHistory || []).filter((item) => item.accountId !== id);
    data.accounts = data.accounts.filter((item) => item.id !== id);

    // Per-account signal decisions live inside each signal record.
    for (const signal of data.signals || []) {
      if (signal.decisions && signal.decisions[id]) delete signal.decisions[id];
    }

    for (const kind of ['investor-pass']) {
      try {
        const file = accountSecretFile(id, kind);
        if (fs.existsSync(file)) fs.unlinkSync(file);
      } catch (error) {
        logError('account:delete:secret', error);
      }
    }

    save(data);
    return data;
  });

  ipcMain.handle('backtest:start', (_, payload) => {
    const data = read();
    // إذا اختار المستخدم ملف CSV خاص بالباكتيست (من Replay JForex)، استخدمه، وإلا استخدم الملف الحي
    const csvPath = payload.backtestCsvPath && fs.existsSync(payload.backtestCsvPath) ? payload.backtestCsvPath : ensureCsvPath(data);
    const backtest = {
      ...payload,
      id: crypto.randomUUID(),
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
      // A backtest is a standalone virtual account. It only reads CISD
      // signals; no real account, trade, balance or risk record is referenced.
      startingCapital: Number(payload.startingCapital) || 100000,
      currentBalance: Number(payload.startingCapital) || 100000,
      currency: String(payload.currency || 'USD'),
      riskPerR: Math.max(0, Number(payload.riskPerR) || 0),
      sourceCsvPath: csvPath,
      backtestCsvPath: payload.backtestCsvPath || '',
      filters: {
        start: payload.start || '',
        end: payload.end || '',
        session: payload.session || '',
        symbol: payload.symbol || '',
        tf: payload.tf || '',
      },
    };
    data.backtests.unshift(backtest);
    data.activeBacktestId = backtest.id;
    save(data);
    return importBacktestSessionSignals(backtest.id, { recordNoop: true });
  });

  ipcMain.handle('backtest:archive', (_, id) => {
    const data = read();
    const backtest = data.backtests.find((item) => item.id === id);
    if (backtest) backtest.status = 'ARCHIVED';
    save(data);
    return data;
  });

  ipcMain.handle('backtest:reset', (_, id) => {
    const data = read();
    data.backtestSignals = (data.backtestSignals || []).filter((item) => item.backtestId !== id);
    data.backtestTrades = (data.backtestTrades || []).filter((item) => item.backtestId !== id);
    data.backtests = data.backtests.filter((item) => item.id !== id);
    if (data.activeBacktestId === id) data.activeBacktestId = null;
    save(data);
    return data;
  });

  ipcMain.handle('backtest:stop', () => {
    const data = read();
    const active = data.backtests.find((item) => item.id === data.activeBacktestId);
    if (active) active.status = 'FINISHED';
    data.activeBacktestId = null;
    save(data);
    return data;
  });

  ipcMain.handle('backtest:refresh', (_, id) => importBacktestSessionSignals(id, { recordNoop: true }));
  ipcMain.handle('backtest:review-signal', (_, signalId, payload = {}) => {
    const data = read();
    const signal = (data.backtestSignals || []).find((item) => item.id === signalId);
    if (!signal) throw new Error(getBundle(data.settings?.locale).errors.backtestSignalNotFound || 'Backtest signal not found');
    signal.status = payload.status || signal.status || 'NEW';
    signal.resultR = payload.resultR !== undefined ? Number(payload.resultR) : signal.resultR;
    signal.reviewNote = payload.note || '';
    signal.reviewedAt = new Date().toISOString();
    save(data);
    return data;
  });

  ipcMain.handle('backtest:trade:add', (_, backtestId, payload = {}) => {
    const data = read();
    const backtest = (data.backtests || []).find((item) => item.id === backtestId && item.status !== 'ARCHIVED');
    if (!backtest) throw new Error(getBundle(data.settings?.locale).errors.backtestNotFound || 'Backtest not found');
    const resultR = Number(payload.resultR || 0);
    const trade = {
      id: crypto.randomUUID(), backtestId, symbol: String(payload.symbol || '').toUpperCase(),
      side: payload.side === 'Sell' ? 'Sell' : 'Buy', resultR,
      note: String(payload.note || ''), signalId: String(payload.signalId || ''),
      date: payload.date || new Date().toISOString().slice(0, 10), createdAt: new Date().toISOString(),
    };
    if (!trade.symbol) throw new Error('Backtest trade requires a symbol');
    data.backtestTrades = data.backtestTrades || [];
    data.backtestTrades.unshift(trade);
    // The virtual ledger changes only this virtual balance. Risk per R is
    // configured when the session begins, so a +1.5R decision has a clear
    // monetary meaning without touching any funded account.
    const riskPerR = Number(backtest.riskPerR || 0);
    const totalPnl = data.backtestTrades
      .filter((item) => item.backtestId === backtestId)
      .reduce((sum, item) => sum + (Number(item.resultR) || 0) * riskPerR, 0);
    trade.pnl = resultR * riskPerR;
    backtest.currentBalance = Number(backtest.startingCapital || 0) + totalPnl;
    backtest.updatedAt = new Date().toISOString();
    save(data);
    return data;
  });

  ipcMain.handle('daily:save', (_, day, payload) => {
    const data = read();
    const index = data.daily.findIndex((item) => item.accountId === payload.accountId && item.day === day);
    const value = { accountId: payload.accountId, day, ...payload };
    // Mark the day as reviewed only when the trader actually wrote a review,
    // so the weekly review-rate reflects real effort rather than a saved draft.
    if (payload.wentWell || payload.toImprove) value.reviewedAt = new Date().toISOString();
    if (index >= 0) data.daily[index] = { ...data.daily[index], ...value };
    else data.daily.push(value);
    save(data);
    return data;
  });

  ipcMain.handle('trade:add', (_, trade) => {
    const data = read();
    data.trades.unshift({ ...trade, id: crypto.randomUUID(), createdAt: new Date().toISOString() });
    save(data);
    return data;
  });

  /**
   * Corrects a previously logged trade.
   *
   * Without this, a mistyped R could only be fixed by resetting the whole
   * account — destroying every other trade to repair one. Identity fields
   * (id, accountId, createdAt) are pinned so an edit can never move a trade
   * to another account or forge its creation time.
   */
  ipcMain.handle('trade:update', (_, tradeId, patch = {}) => {
    const data = read();
    const index = data.trades.findIndex((item) => item.id === tradeId);
    if (index < 0) throw new Error(getBundle(data.settings?.locale).errors?.tradeNotFound || 'Trade not found');

    const existing = data.trades[index];
    data.trades[index] = {
      ...existing,
      ...patch,
      id: existing.id,
      accountId: existing.accountId,
      createdAt: existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    save(data);
    return data;
  });

  ipcMain.handle('trade:delete', (_, tradeId) => {
    const data = read();
    const index = data.trades.findIndex((item) => item.id === tradeId);
    if (index < 0) throw new Error(getBundle(data.settings?.locale).errors?.tradeNotFound || 'Trade not found');
    data.trades.splice(index, 1);
    save(data);
    return data;
  });

  ipcMain.handle('mt5:choose', async (_, accountId) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'MT5 Detailed Report', extensions: ['html', 'htm', 'csv', 'txt'] }],
    });
    if (result.canceled) return { cancelled: true };

    try {
      return importMT5File(result.filePaths[0], accountId);
    } catch (error) {
      const data = read();
      const account = data.accounts.find((item) => item.id === accountId);
      if (account) account.lastMT5Error = error.message;
      save(data);
      throw error;
    }
  });

  ipcMain.handle('fundednext:folder', async (_, accountId) => {
    const result = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
    if (result.canceled) return { cancelled: true };

    const data = read();
    const account = ensureAccount(data, accountId);
    account.fundedNextFolder = result.filePaths[0];
    save(data);
    watchFundedNextFolder(accountId, account.fundedNextFolder);
    return { state: read(), folder: account.fundedNextFolder };
  });

  ipcMain.handle('fundednext:choose', async (_, accountId) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'FundedNext CSV', extensions: ['csv', 'txt'] }],
    });
    if (result.canceled) return { cancelled: true };

    try {
      return importFundedNextFile(result.filePaths[0], accountId);
    } catch (error) {
      const data = read();
      const account = data.accounts.find((item) => item.id === accountId);
      if (account) account.lastFundedNextError = error.message;
      save(data);
      throw error;
    }
  });

  ipcMain.handle('csv:choose', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'CISD CSV', extensions: ['csv'] }],
    });

    if (!result.canceled) {
      const data = read();
      data.settings.csvPath = result.filePaths[0];
      save(data);
      watchSignalsFile();
    }

    return read();
  });

  ipcMain.handle('backtest:csv:choose', async () => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'CISD Backtest CSV', extensions: ['csv', 'txt'] }],
    });
    if (result.canceled) return { cancelled: true, path: '' };
    return { cancelled: false, path: result.filePaths[0] };
  });

  ipcMain.handle('signal:status', (_, id, accountId, status, reason) => {
    const data = read();
    const signal = data.signals.find((item) => item.SignalID === id);
    if (signal) {
      signal.decisions = signal.decisions || {};
      signal.decisions[accountId] = {
        status,
        reason: reason || '',
        updatedAt: new Date().toISOString(),
      };
      save(data);
    }
    return data;
  });

  ipcMain.on('window:minimize', () => win?.minimize());
  ipcMain.on('window:maximize', () => (win?.isMaximized() ? win.unmaximize() : win?.maximize()));
  ipcMain.on('window:close', () => win?.close());
}

// Two instances would race on the same journal-data.json and could lose trades.
const hasInstanceLock = app.requestSingleInstanceLock();

if (!hasInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  app.whenReady().then(() => {
    createWindow();
    watchSignalsFile();
    watchAllFundedNextFolders();
    registerHandlers();
    scheduleNewsAutoFetch();
  });

  app.on('window-all-closed', () => app.quit());
}
