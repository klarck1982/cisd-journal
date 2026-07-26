const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildRuntimeReadinessSnapshot } = require('../lib/runtime-readiness');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cisd-runtime-'));
const bridgesDir = path.join(dir, 'bridges');
fs.mkdirSync(bridgesDir, { recursive: true });
fs.writeFileSync(path.join(bridgesDir, 'mt5_readonly_sync.py'), '# bridge');
fs.writeFileSync(path.join(bridgesDir, 'mt5_readonly_sync.exe'), 'exe');

let snapshot = buildRuntimeReadinessSnapshot({
  app: { resourcesPath: dir },
  isPackaged: true,
  currentDirname: dir,
  platform: 'win32',
});
assert.equal(snapshot.packaged, true);
assert.equal(snapshot.mt5Bridge.packagedExecutableExists, true);
assert.equal(snapshot.readyForBundledInvestorPass, true);

fs.unlinkSync(path.join(bridgesDir, 'mt5_readonly_sync.exe'));
snapshot = buildRuntimeReadinessSnapshot({
  app: { resourcesPath: dir },
  isPackaged: true,
  currentDirname: dir,
  platform: 'win32',
});
assert.equal(snapshot.mt5Bridge.packagedExecutableExists, false);
assert.equal(snapshot.readyForBundledInvestorPass, false);

fs.rmSync(dir, { recursive: true, force: true });
console.log('Runtime Readiness QA: PASS (bundled bridge detection)');
