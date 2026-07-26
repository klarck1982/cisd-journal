const path = require('path');

const SUPPORTED_LOCALES = ['ar', 'en'];
const DEFAULT_LOCALE = 'ar';

const bundles = {
  ar: require(path.join('..', 'locales', 'ar.json')),
  en: require(path.join('..', 'locales', 'en.json')),
};

function resolveLocale(locale) {
  if (!locale || typeof locale !== 'string') return DEFAULT_LOCALE;
  const normalized = locale.toLowerCase().trim();
  if (SUPPORTED_LOCALES.includes(normalized)) return normalized;
  if (normalized.startsWith('ar')) return 'ar';
  if (normalized.startsWith('en')) return 'en';
  return DEFAULT_LOCALE;
}

function getDirection(locale) {
  return resolveLocale(locale) === 'ar' ? 'rtl' : 'ltr';
}

function getBundle(locale) {
  return bundles[resolveLocale(locale)] || bundles[DEFAULT_LOCALE];
}

module.exports = {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  resolveLocale,
  getDirection,
  getBundle,
};
