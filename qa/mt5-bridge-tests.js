const assert = require('assert');
const path = require('path');
const { resolveMt5BridgeCandidates } = require('../lib/mt5-bridge');

let plan = resolveMt5BridgeCandidates({
  app: { isPackaged: false },
  isPackaged: false,
  currentDirname: 'C:/repo',
  platform: 'win32',
  preferExecutable: true,
});
assert.equal(plan.exePath, path.join('C:/repo', 'bridges', 'mt5_readonly_sync.exe'));
assert.equal(plan.candidates[0].kind, 'executable');
assert.equal(plan.candidates[1].command, 'py');

plan = resolveMt5BridgeCandidates({
  app: { isPackaged: true },
  isPackaged: true,
  currentDirname: 'C:/repo',
  platform: 'linux',
  preferExecutable: true,
});
assert.ok(plan.exePath.includes(path.join('bridges', 'mt5_readonly_sync.exe')));
assert.equal(plan.candidates[1].command, 'python3');

console.log('MT5 Bridge QA: PASS (candidate resolution for EXE and Python fallback)');
