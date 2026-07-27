/**
 * Design-system guard.
 *
 * The stylesheet did not drift because anyone chose badly — it drifted because
 * nothing stopped a new component from inventing its own values. It had reached
 * 218 hand-written colour literals resolving to 120 distinct values (the same
 * blue at 20 opacities), 14 font sizes and 19 shadows.
 *
 * These assertions keep the token system closed: if a component needs a value,
 * it has to be added to :root first.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readText(...segments) {
  // A Windows checkout with core.autocrlf=true delivers CRLF. Normalise every
  // source fixture so regex anchors and CSS block slicing mean the same thing
  // on windows-latest as they do on ubuntu-latest.
  return fs.readFileSync(path.join(...segments), 'utf8').replace(/\r\n?/g, '\n');
}

function sourcePosition(source, index) {
  const safeIndex = Math.max(0, Math.min(index, source.length));
  const line = source.slice(0, safeIndex).split('\n').length;
  const lineStart = source.lastIndexOf('\n', safeIndex - 1) + 1;
  return `line ${line}, column ${safeIndex - lineStart + 1}`;
}

function findMatchingBrace(source, openIndex, label) {
  let depth = 0;
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = openIndex; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        index++;
      }
      continue;
    }

    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '/' && next === '*') {
      inComment = true;
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return index + 1;
      assert.ok(depth >= 0, `${label} closes too many braces at ${sourcePosition(source, index)}`);
    }
  }

  assert.fail(`${label} opened at ${sourcePosition(source, openIndex)} but was never closed`);
}

function findRuleBlockEnd(source, selector) {
  let quote = null;
  let escaped = false;
  let inComment = false;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (inComment) {
      if (char === '*' && next === '/') {
        inComment = false;
        index++;
      }
      continue;
    }

    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }

    if (char === '/' && next === '*') {
      inComment = true;
      index++;
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (!source.startsWith(selector, index)) continue;

    const before = source[index - 1] || '';
    const after = source[index + selector.length] || '';
    if (/[A-Za-z0-9_-]/.test(before) || /[A-Za-z0-9_-]/.test(after)) continue;

    let openIndex = index + selector.length;
    while (/\s/.test(source[openIndex] || '')) openIndex++;
    if (source[openIndex] !== '{') continue;

    return findMatchingBrace(source, openIndex, `${selector} block`);
  }

  assert.fail(`${selector} block must exist in renderer/style.css`);
}

// Everything after the :root block is component territory. The closing brace is
// found by matching braces instead of searching for a literal '\n}\n': the
// token block must still be found if formatting changes, comments contain
// braces, or a checkout uses CRLF line endings.
const css = readText(root, 'renderer', 'style.css');
const html = readText(root, 'renderer', 'index.html');

const rootEnd = findRuleBlockEnd(css, ':root');
const tokens = css.slice(0, rootEnd);
const components = css.slice(rootEnd);

// --- 1) No raw colour literals outside :root ---------------------------------
const rawColours = components.match(/rgba?\([0-9][^)]*\)/g) || [];
assert.deepEqual(
  [...new Set(rawColours)],
  [],
  `colours must come from tokens; found ${rawColours.length} raw literal(s) outside :root`
);

const rawHex = (components.match(/#[0-9a-fA-F]{3,8}\b/g) || []);
assert.deepEqual([...new Set(rawHex)], [], 'hex colours must be declared as tokens in :root');

// --- 2) No raw font sizes outside :root --------------------------------------
const rawFontSizes = components.match(/font-size:\s*[0-9.]+px/g) || [];
assert.deepEqual(
  [...new Set(rawFontSizes)],
  [],
  'font sizes must use the --t-* scale so the type hierarchy stays readable'
);

// --- 3) Radii come from the 3-step scale (999px pills excepted) --------------
const rawRadii = (components.match(/border-radius:\s*[0-9]+px/g) || [])
  .filter((rule) => !rule.includes('999px'));
assert.deepEqual([...new Set(rawRadii)], [], 'border-radius must use --radius / --radius-md / --radius-sm');

// --- 4) The token scales stay small ------------------------------------------
// A scale nobody can hold in their head is not a scale.
const fontSteps = (tokens.match(/--t-[a-z0-9]+:/g) || []).length;
assert.ok(fontSteps <= 8, `type scale must stay small; found ${fontSteps} steps`);

const spaceSteps = (tokens.match(/--sp-[0-9]+:/g) || []).length;
assert.ok(spaceSteps <= 8, `spacing scale must stay small; found ${spaceSteps} steps`);

// --- 5) Arabic-capable font stack, listed before the Latin fallbacks ---------
// Inter carries no Arabic glyphs. Leading with it silently rendered the whole
// Arabic UI in Tahoma — a fallback nobody chose — in a product whose stated
// differentiator is being Arabic-first.
const fontDecl = /--font:\s*([^;]+);/.exec(tokens);
assert.ok(fontDecl, ':root must declare a --font stack');
const stack = fontDecl[1];
const firstFamily = stack.split(',')[0].trim().replace(/["']/g, '');
assert.ok(
  /arabic|noto|dubai|cairo|tajawal/i.test(firstFamily),
  `--font must lead with an Arabic-capable family, not "${firstFamily}"`
);
assert.ok(
  !/^\s*["']?Inter/i.test(stack),
  'Inter has no Arabic coverage and must not lead the UI font stack'
);

// --- 5b) The Arabic face is actually bundled, not merely named ---------------
// Naming a font the user's machine may not have is how the previous stack
// silently degraded to Tahoma. The files must exist, be real WOFF2, be shipped
// by electron-builder, and be permitted by the CSP.
{
  const faces = [...css.matchAll(/@font-face\s*\{[^}]*\}/g)].map((match) => match[0]);
  assert.ok(faces.length >= 2, 'the Arabic UI face must be bundled via @font-face');

  const arabicFace = faces.find((face) => /unicode-range:[^;]*U\+0600/i.test(face));
  assert.ok(arabicFace, 'a bundled face must cover the Arabic block (U+0600–06FF)');

  const referenced = [...css.matchAll(/url\("(fonts\/[^"]+)"\)/g)].map((match) => match[1]);
  assert.ok(referenced.length >= 2, '@font-face rules must reference bundled font files');

  for (const relative of new Set(referenced)) {
    const file = path.join(root, 'renderer', relative);
    assert.ok(fs.existsSync(file), `${relative} is referenced but not bundled`);
    // WOFF2 files begin with the ASCII signature "wOF2".
    const signature = fs.readFileSync(file).subarray(0, 4).toString('latin1');
    assert.equal(signature, 'wOF2', `${relative} must be a valid WOFF2 file`);
  }

  const license = path.join(root, 'renderer', 'fonts', 'LICENSE.txt');
  assert.ok(fs.existsSync(license), 'a bundled typeface must ship its licence');

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  const shipped = (pkg.build?.files || []).some((entry) => entry.startsWith('renderer'));
  assert.ok(shipped, 'electron-builder must package the renderer directory, including fonts');

  const csp = /Content-Security-Policy" content="([^"]+)"/.exec(html);
  assert.ok(csp, 'the renderer must declare a CSP');
  assert.ok(
    /font-src[^;]*'self'/.test(csp[1]) || /default-src[^;]*'self'/.test(csp[1]),
    'the CSP must allow self-hosted fonts'
  );
}

// --- 6) Arabic needs vertical breathing room ---------------------------------
assert.ok(
  /html,\s*body\s*\{[^}]*line-height:/s.test(css),
  'body must set an explicit line-height; the Latin default (~1.2) crowds Arabic'
);

// --- 7) Figures align in columns ---------------------------------------------
assert.ok(
  /\.metric-card strong[^{]*\{[^}]*font-variant-numeric:\s*tabular-nums/s.test(css)
  || /\.metric-card strong,[^{]*\{[^}]*tabular-nums/s.test(css)
  || /tabular-nums/.test(css.slice(css.indexOf('.metric-card strong') - 400, css.indexOf('.metric-card strong') + 400)),
  'primary metric figures must use tabular-nums so columns of numbers line up'
);

// --- 8) Keyboard focus is visible --------------------------------------------
assert.ok(/:focus-visible/.test(css), 'the app must show a focus ring; there are dozens of buttons');

// --- 9) Interactive controls carry an accessible name ------------------------
// Icon-only buttons render a glyph with no text, which a screen reader cannot
// announce and a keyboard user cannot identify.
const iconOnly = [...html.matchAll(/<button[^>]*class="[^"]*\bicon\b[^"]*"[^>]*>/g)]
  .map((match) => match[0])
  .filter((tag) => !/aria-label=/.test(tag));
assert.deepEqual(
  iconOnly.map((tag) => (/id="([^"]+)"/.exec(tag) || [])[1] || tag),
  [],
  'icon-only buttons need an aria-label'
);

// --- 10) Modals are announced as dialogs -------------------------------------
const modals = [...html.matchAll(/<div[^>]*\bid="(\w*[Mm]odal|welcomeOverlay)"[^>]*>/g)].map((match) => match[0]);
const undeclared = modals
  .filter((tag) => !/role="dialog"/.test(tag))
  .map((tag) => (/id="([^"]+)"/.exec(tag) || [])[1]);
assert.deepEqual(undeclared, [], 'every modal needs role="dialog" and aria-modal');

console.log('Design System QA: PASS (closed tokens, Arabic-first stack, tabular figures, focus ring, dialog semantics)');
