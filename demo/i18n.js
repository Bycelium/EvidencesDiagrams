import { en } from './locales/en.js';
import { fr } from './locales/fr.js';

export const localeRegistry = Object.freeze({ en, fr });
export const supportedLocales = Object.freeze(Object.values(localeRegistry).map(({ meta }) => meta));
export const DEFAULT_LOCALE = 'en';

function templateFor(entry, count, locale) {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object' || count === undefined) return undefined;
  const category = new Intl.PluralRules(localeRegistry[locale].meta.numberLocale).select(Number(count));
  return entry[category] ?? entry.other;
}

function interpolate(template, values) {
  return template.replace(/\{([a-zA-Z][\w]*)\}/g, (match, key) => (
    Object.hasOwn(values, key) ? String(values[key]) : match
  ));
}

export function resolveLocale(locale) {
  return Object.hasOwn(localeRegistry, locale) ? locale : DEFAULT_LOCALE;
}

export function createI18n(initialLocale = DEFAULT_LOCALE) {
  let locale = resolveLocale(initialLocale);
  return {
    get locale() { return locale; },
    get meta() { return localeRegistry[locale].meta; },
    setLocale(nextLocale) { locale = resolveLocale(nextLocale); return locale; },
    t(key, values = {}) {
      const localizedEntry = localeRegistry[locale].messages[key];
      const entry = localizedEntry ?? localeRegistry[DEFAULT_LOCALE].messages[key];
      const messageLocale = localizedEntry === undefined ? DEFAULT_LOCALE : locale;
      return interpolate(templateFor(entry, values.count, messageLocale) ?? key, values);
    },
    number(value, options = {}) {
      return new Intl.NumberFormat(localeRegistry[locale].meta.numberLocale, options).format(value);
    },
    percent(value, options = {}) {
      return new Intl.NumberFormat(localeRegistry[locale].meta.numberLocale, {
        style: 'percent',
        maximumFractionDigits: 1,
        ...options,
      }).format(value);
    },
  };
}
