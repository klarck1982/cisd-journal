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
const css = fs.readFileSync(path.join(root, 'renderer', 'style.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');

// Everything after the :root block is component territory.
const rootEnd = css.indexOf('\n}\n', css.indexOf(':root {')) + 3;
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
