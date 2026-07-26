const assert = require('assert');
const { resolveLocale, getDirection, getBundle, DEFAULT_LOCALE } = require('../lib/locale');

assert.equal(DEFAULT_LOCALE, 'ar');
assert.equal(resolveLocale('ar'), 'ar');
assert.equal(resolveLocale('ar-SA'), 'ar');
assert.equal(resolveLocale('en-GB'), 'en');
assert.equal(resolveLocale('unknown'), 'ar');
assert.equal(getDirection('ar'), 'rtl');
assert.equal(getDirection('en'), 'ltr');
assert.equal(getBundle('ar').meta.label, 'العربية');
assert.equal(getBundle('en').meta.label, 'English');
assert.ok(getBundle('en').notifications.newSignalTitle.includes('New Signal'));

console.log('Locale QA: PASS (locale resolution, direction, bundle loading)');
