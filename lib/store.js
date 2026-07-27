const fs = require('fs');
const path = require('path');
const { resolveLocale, DEFAULT_LOCALE } = require('./locale');

function createStore(app) {
  const dataFile = () => path.join(app.getPath('userData'), 'journal-data.json');

  const initial = () => ({
    version: 4,
    accounts: [
      {
        id: 'fundingpips',
        firm: 'FundingPips',
        name: 'FundingPips Account',
        capital: 0,
        currency: 'USD',
        phase: 'Challenge',
        profitTarget: 0,
        dailyLoss: 0,
        maxDrawdown: 0,
        currentBalance: 0,
      },
      {
        id: 'fundednext',
        firm: 'FundedNext',
        name: 'FundedNext Account',
        capital: 0,
        currency: 'USD',
        phase: 'Challenge',
        profitTarget: 0,
        dailyLoss: 0,
        maxDrawdown: 0,
        currentBalance: 0,
      },
    ],
    trades: [],
    openPositions: [],
    signals: [],
    backtestSignals: [],
    importHistory: [],
    backtests: [],
    playbooks: [],
    activeBacktestId: null,
    daily: [],
    settings: {
      csvPath: '',
      timezone: 'America/New_York',
      locale: DEFAULT_LOCALE,
      newsProvider: 'FREE',
      dashboardDensity: 'comfortable',
      notifications: true,
      onboardingComplete: false,
      lastSignalSync: '',
    },
  });

  function normalize(data) {
    const base = initial();
    const incoming = data || {};
    const normalized = { ...base, ...incoming };

    for (const key of ['accounts', 'trades', 'openPositions', 'signals', 'backtestSignals', 'backtests', 'playbooks', 'daily', 'importHistory']) {
      normalized[key] = Array.isArray(incoming[key]) ? incoming[key] : base[key];
    }

    // Record the schema version we migrated to, so future migrations are traceable.
    normalized.version = base.version;

    normalized.settings = {
      ...base.settings,
      ...(incoming.settings || {}),
      locale: resolveLocale(incoming.settings?.locale || base.settings.locale),
      notifications: incoming.settings?.notifications !== false,
    };

    return normalized;
  }

  function logError(where, error) {
    try {
      fs.appendFileSync(
        path.join(app.getPath('userData'), 'cisd-journal-errors.log'),
        `[${new Date().toISOString()}] ${where}: ${error.message || error}\n`
      );
    } catch {}
  }

  function read() {
    try {
      return normalize(JSON.parse(fs.readFileSync(dataFile(), 'utf8')));
    } catch (error) {
      if (fs.existsSync(dataFile())) {
        try {
          fs.copyFileSync(dataFile(), `${dataFile()}.corrupt-${Date.now()}`);
        } catch {}
      }
      logError('read', error);
      return initial();
    }
  }

  function save(data) {
    const target = dataFile();
    const temp = `${target}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(normalize(data), null, 2));
      fs.renameSync(temp, target);
    } catch (error) {
      try {
        if (fs.existsSync(temp)) fs.unlinkSync(temp);
      } catch {}
      logError('save', error);
      throw error;
    }
  }

  return { dataFile, initial, normalize, logError, read, save };
}

module.exports = { createStore };
