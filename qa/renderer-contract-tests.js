/**
 * Static contract checks for the renderer.
 *
 * These catch the class of bug that only appears once the app actually runs on Windows:
 * unsupported browser dialogs, DOM ids referenced but never defined, missing translations,
 * and exposed IPC APIs that no longer have a matching handler.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'renderer', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'renderer', 'style.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const ar = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'ar.json'), 'utf8'));
const en = JSON.parse(fs.readFileSync(path.join(root, 'locales', 'en.json'), 'utf8'));

// --- 1) Electron does not implement window.prompt(); it throws at runtime. -------------
const stripped = app.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const bareDialog = /(^|[^.\w$])(prompt|alert)\s*\(/.exec(stripped);
assert.equal(
  bareDialog,
  null,
  `renderer must not call window.${bareDialog ? bareDialog[2] : ''}() — Electron throws "prompt() is and will not be supported"`
);
// confirm() blocks the renderer thread; we use the in-app modal instead.
assert.equal(/(^|[^.\w$])confirm\s*\(/.test(stripped.replace(/openConfirm\s*\(/g, '')), false, 'use openConfirm() instead of window.confirm()');
assert.ok(app.includes('function openConfirm'), 'openConfirm helper must exist');
assert.ok(app.includes('function openAccountModal'), 'account creation must use an in-app modal');

// --- 2) A frameless window needs an explicit drag region. -----------------------------
assert.ok(main.includes('frame: false'), 'sanity: window is frameless');
assert.ok(/-webkit-app-region:\s*drag/.test(css), 'titlebar must be draggable');
assert.ok(/-webkit-app-region:\s*no-drag/.test(css), 'titlebar buttons must stay clickable');

// --- 3) Every id the renderer queries must exist in the markup. -----------------------
const htmlIds = new Set([...html.matchAll(/id="([A-Za-z0-9_-]+)"/g)].map((m) => m[1]));
const queried = new Set([...app.matchAll(/\$\('#([A-Za-z0-9_-]+)'\)/g)].map((m) => m[1]));
const missingIds = [...queried].filter((id) => !htmlIds.has(id)).sort();
assert.deepEqual(missingIds, [], `renderer queries ids missing from index.html: ${missingIds.join(', ')}`);

// --- 4) Every t('...') key must resolve in BOTH locales. ------------------------------
function lookup(bundle, dotted) {
  return dotted.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), bundle);
}
const usedKeys = [...new Set([...app.matchAll(/\bt\('([^']+)'/g)].map((m) => m[1]))];
for (const locale of [['ar', ar], ['en', en]]) {
  const broken = usedKeys.filter((key) => typeof lookup(locale[1], key) !== 'string');
  assert.deepEqual(broken, [], `missing ${locale[0]} translations: ${broken.join(', ')}`);
}

// --- 5) The two bundles must stay structurally identical. -----------------------------
function flatten(obj, prefix = '', out = new Set()) {
  for (const [key, value] of Object.entries(obj)) {
    const dotted = prefix ? `${prefix}.${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) flatten(value, dotted, out);
    else out.add(dotted);
  }
  return out;
}
const arKeys = flatten(ar);
const enKeys = flatten(en);
const onlyAr = [...arKeys].filter((k) => !enKeys.has(k));
const onlyEn = [...enKeys].filter((k) => !arKeys.has(k));
assert.deepEqual(onlyAr, [], `keys only in ar.json: ${onlyAr.join(', ')}`);
assert.deepEqual(onlyEn, [], `keys only in en.json: ${onlyEn.join(', ')}`);

// --- 6) preload <-> main IPC contract must match in both directions. ------------------
const handlers = new Set([...main.matchAll(/ipcMain\.(?:handle|on)\('([^']+)'/g)].map((m) => m[1]));
const channels = new Set([...preload.matchAll(/ipcRenderer\.(?:invoke|send)\('([^']+)'/g)].map((m) => m[1]));
const orphanChannels = [...channels].filter((c) => !handlers.has(c)).sort();
assert.deepEqual(orphanChannels, [], `preload exposes channels with no main handler: ${orphanChannels.join(', ')}`);

// --- 7) Features promised in the UI must actually be wired to the backend. ------------
for (const api of ['chooseImage', 'exportTrades', 'resetAccount']) {
  assert.ok(app.includes(`cisd.${api}(`), `renderer must use the ${api} API`);
}

console.log('Renderer Contract QA: PASS (no blocking dialogs, drag region, ids, i18n, IPC wiring)');
