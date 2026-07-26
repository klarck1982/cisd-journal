/**
 * Entity lifecycle contract tests.
 *
 * These cover the flow defects found in docs/FLOW_AUDIT_2026-07.md, where the
 * bug class was not "the code throws" but "the code quietly does more, or less,
 * than the UI promised". Each case below failed before this pass.
 *
 * main.js cannot be required outside Electron, so the IPC handlers are read as
 * source and their bodies executed against a plain state object. That keeps the
 * assertions honest about the real implementation rather than a reimplementation.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

/**
 * Extracts a single ipcMain.handle('<channel>', ...) body plus its real
 * parameter list, so the test binds arguments by the names main.js actually
 * uses rather than assuming them.
 */
function handlerParts(channel) {
  const marker = `ipcMain.handle('${channel}'`;
  const start = mainSource.indexOf(marker);
  assert.ok(start >= 0, `handler ${channel} must exist in main.js`);

  // Signature sits between the channel string and the arrow.
  const arrow = mainSource.indexOf('=>', start);
  const sigOpen = mainSource.indexOf('(', mainSource.indexOf(',', start));
  const sigClose = mainSource.lastIndexOf(')', arrow);
  const params = mainSource
    .slice(sigOpen + 1, sigClose)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const bodyStart = mainSource.indexOf('{', arrow);
  let depth = 0;
  let index = bodyStart;
  for (; index < mainSource.length; index++) {
    if (mainSource[index] === '{') depth++;
    else if (mainSource[index] === '}') {
      depth--;
      if (depth === 0) break;
    }
  }

  return { params, body: mainSource.slice(bodyStart + 1, index) };
}

function runHandler(channel, state, args = []) {
  const { params, body } = handlerParts(channel);
  const scope = {
    read: () => state,
    save: () => {},
    crypto: require('crypto'),
    fs: { existsSync: () => false, unlinkSync: () => {} },
    logError: () => {},
    closeFundedNextWatcher: () => {},
    accountSecretFile: () => '/tmp/none.bin',
    getBundle: () => ({ errors: {} }),
    createPlaybook: (payload) => payload,
  };

  // Declared params minus the leading IPC event placeholder.
  const declared = params.map((part) => part.split('=')[0].trim());
  const fn = new Function(...Object.keys(scope), ...declared, body);
  return fn(...Object.values(scope), null, ...args);
}

// --- 1) account:reset must not disarm the risk guard -------------------------
// The confirmation text promises to remove trades, positions, backtests and
// notes. It says nothing about risk limits, yet the handler used to zero
// profitTarget / dailyLoss / maxDrawdown and reset phase. Zeroing dailyLoss
// makes buildRiskSnapshot() return a null dailyLossLimit — the guard the
// product exists to provide silently stops working.
{
  const state = {
    accounts: [{
      id: 'a',
      capital: 100000,
      currentBalance: 92000,
      profitTarget: 8,
      dailyLoss: 2,
      maxDrawdown: 6,
      phase: 'Funded',
    }],
    trades: [{ accountId: 'a', id: 't1' }, { accountId: 'b', id: 't2' }],
    openPositions: [{ accountId: 'a' }],
    backtests: [{ id: 'bt1', accountId: 'a' }],
    backtestSignals: [{ backtestId: 'bt1' }],
    daily: [{ accountId: 'a' }],
  };

  runHandler('account:reset', state, ['a']);
  const account = state.accounts[0];

  assert.equal(account.profitTarget, 8, 'reset must preserve profitTarget');
  assert.equal(account.dailyLoss, 2, 'reset must preserve dailyLoss — zeroing it disables the daily guard');
  assert.equal(account.maxDrawdown, 6, 'reset must preserve maxDrawdown');
  assert.equal(account.phase, 'Funded', 'reset must preserve the funding phase');
  assert.equal(account.currentBalance, 100000, 'balance returns to capital because the history that moved it is gone');

  assert.equal(state.trades.length, 1, 'only this account\'s trades are cleared');
  assert.equal(state.trades[0].accountId, 'b', 'another account\'s trades survive');
  assert.equal(state.openPositions.length, 0);
  assert.equal(state.backtests.length, 0);
  assert.equal(state.backtestSignals.length, 0);
}

// --- 2) trade:update corrects a trade without touching identity --------------
{
  const state = {
    accounts: [{ id: 'a' }],
    trades: [{ id: 't1', accountId: 'a', createdAt: '2026-07-01T00:00:00.000Z', resultR: 2.5, symbol: 'XAUUSD' }],
    settings: {},
  };

  runHandler('trade:update', state, ['t1', { resultR: -2.5, symbol: 'EURUSD', accountId: 'hacked', id: 'forged' }]);
  const trade = state.trades[0];

  assert.equal(trade.resultR, -2.5, 'the corrected value is stored');
  assert.equal(trade.symbol, 'EURUSD');
  assert.equal(trade.id, 't1', 'id cannot be rewritten by the patch');
  assert.equal(trade.accountId, 'a', 'a trade cannot be moved to another account by an edit');
  assert.equal(trade.createdAt, '2026-07-01T00:00:00.000Z', 'creation time cannot be forged');
  assert.ok(trade.updatedAt, 'an edit is timestamped');
}

// --- 3) trade:delete removes exactly one trade -------------------------------
{
  const state = {
    accounts: [{ id: 'a' }],
    trades: [{ id: 't1', accountId: 'a' }, { id: 't2', accountId: 'a' }],
    settings: {},
  };
  runHandler('trade:delete', state, ['t2']);
  assert.deepEqual(state.trades.map((trade) => trade.id), ['t1']);
}

// --- 4) account:delete removes the account and everything referencing it -----
// An orphaned trade would keep feeding the analytics of an account that no
// longer exists.
{
  const state = {
    accounts: [{ id: 'a' }, { id: 'b' }],
    trades: [{ accountId: 'a' }, { accountId: 'b' }],
    openPositions: [{ accountId: 'a' }],
    backtests: [{ id: 'bt1', accountId: 'a' }],
    backtestSignals: [{ backtestId: 'bt1' }],
    daily: [{ accountId: 'a' }],
    playbooks: [{ accountId: 'a' }, { accountId: 'b' }],
    importHistory: [{ accountId: 'a' }],
    signals: [{ SignalID: 's1', decisions: { a: { status: 'ORDER_PLACED' }, b: { status: 'MISSED' } } }],
    settings: {},
  };

  runHandler('account:delete', state, ['a']);

  assert.deepEqual(state.accounts.map((item) => item.id), ['b']);
  assert.equal(state.trades.length, 1, 'no orphaned trades survive');
  assert.equal(state.openPositions.length, 0);
  assert.equal(state.backtests.length, 0);
  assert.equal(state.backtestSignals.length, 0, 'backtest signals of the deleted account go too');
  assert.equal(state.playbooks.length, 1);
  assert.equal(state.importHistory.length, 0);
  assert.equal(state.signals[0].decisions.a, undefined, 'per-account signal decisions are cleared');
  assert.ok(state.signals[0].decisions.b, 'another account\'s decision on the same signal survives');
}

// --- 5) archive / unarchive round-trip ---------------------------------------
{
  const state = { accounts: [{ id: 'a' }], settings: {} };
  runHandler('account:archive', state, ['a']);
  assert.equal(state.accounts[0].archived, true);
  runHandler('account:unarchive', state, ['a']);
  assert.equal(state.accounts[0].archived, false, 'archiving must be reversible');
}

// --- 6) onboardingComplete is actually consumed by the renderer --------------
// The flag was written by two handlers and read by nothing, so "Restart
// onboarding" reported success and showed no screen.
{
  const rendererDir = path.join(__dirname, '..', 'renderer', 'app');
  const renderer = fs.readdirSync(rendererDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(rendererDir, name), 'utf8'))
    .join('\n');
  const html = fs.readFileSync(path.join(__dirname, '..', 'renderer', 'index.html'), 'utf8');

  assert.ok(
    /onboardingComplete/.test(renderer),
    'the renderer must read settings.onboardingComplete, otherwise the flag is write-only'
  );
  assert.ok(html.includes('id="welcomeOverlay"'), 'a welcome screen must exist for the flag to gate');
  assert.ok(/completeOnboarding\s*\(/.test(renderer), 'the renderer must be able to complete onboarding');
}

// --- 7) every exposed IPC channel is reachable from the UI -------------------
// Nine channels used to be exposed with no caller: exactly the truncated
// features (archive account, stop backtest, onboarding).
{
  const preload = fs.readFileSync(path.join(__dirname, '..', 'preload.js'), 'utf8');
  const rendererDir = path.join(__dirname, '..', 'renderer', 'app');
  const renderer = fs.readdirSync(rendererDir)
    .filter((name) => name.endsWith('.js'))
    .map((name) => fs.readFileSync(path.join(rendererDir, name), 'utf8'))
    .join('\n');

  const exposed = [...preload.matchAll(/^\s{2}(\w+):/gm)].map((match) => match[1]);
  const orphans = exposed.filter((name) => !new RegExp(`\\.${name}\\s*\\(`).test(renderer));

  assert.deepEqual(
    orphans,
    [],
    `every exposed IPC channel needs a caller; orphaned: ${orphans.join(', ')}`
  );
}

console.log('Lifecycle QA: PASS (reset preserves risk limits, trade update/delete, account delete cascade, archive round-trip, onboarding consumed, zero orphan IPC)');
