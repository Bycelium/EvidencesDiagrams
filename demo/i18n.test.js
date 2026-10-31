import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createI18n,
  localeRegistry,
  resolveLocale,
  supportedLocales,
} from './i18n.js';
import { formatProbabilityDisplay } from '../dist/probability-bounds.js';

function placeholders(entry) {
  const templates = typeof entry === 'string' ? [entry] : Object.values(entry);
  return [...new Set(templates.flatMap((template) => (
    [...template.matchAll(/\{([a-zA-Z][\w]*)\}/g)].map((match) => match[1])
  )))].sort();
}

test('all locale dictionaries expose the same schema', () => {
  const [first, ...rest] = supportedLocales;
  const referenceKeys = Object.keys(localeRegistry[first.id].messages).sort();
  for (const locale of rest) {
    assert.deepEqual(Object.keys(localeRegistry[locale.id].messages).sort(), referenceKeys);
    for (const key of referenceKeys) {
      const reference = localeRegistry[first.id].messages[key];
      const translation = localeRegistry[locale.id].messages[key];
      assert.equal(typeof translation, typeof reference, `${locale.id}:${key} has a compatible message shape`);
      assert.deepEqual(placeholders(translation), placeholders(reference), `${locale.id}:${key} preserves placeholders`);
      if (typeof translation === 'object') assert.equal(typeof translation.other, 'string', `${locale.id}:${key} has an other plural form`);
    }
  }
});

test('unsupported locales safely fall back to English', () => {
  assert.equal(resolveLocale('unknown'), 'en');
  const i18n = createI18n('unknown');
  assert.equal(i18n.locale, 'en');
  assert.equal(i18n.t('app.heading'), 'Weight of evidence diagram');
});

test('a missing localized plural falls back with English plural rules', () => {
  const previous = localeRegistry.fr.messages['evidence.count'];
  delete localeRegistry.fr.messages['evidence.count'];
  try {
    assert.equal(createI18n('fr').t('evidence.count', { count: 0 }), '0 evidence items');
  } finally {
    localeRegistry.fr.messages['evidence.count'] = previous;
  }
});

test('translation handles interpolation, plurals, and locale-aware numbers', () => {
  const i18n = createI18n('en');
  assert.equal(i18n.t('evidence.count', { count: 1 }), '1 evidence item');
  assert.equal(i18n.t('evidence.count', { count: 3 }), '3 evidence items');
  assert.equal(i18n.t('diagram.result', { band: 'Strong', weight: '+10' }), 'Combined weight of evidence: Strong (+10 dBan)');
  i18n.setLocale('fr');
  assert.equal(i18n.t('evidence.count', { count: 0 }), '0 preuve');
  assert.equal(i18n.t('evidence.count', { count: 2 }), '2 preuves');
  assert.equal(i18n.number(12.5, { maximumFractionDigits: 1 }), '12,5');
  assert.equal(
    i18n.t('probability.comparison', {
      operator: '≥', percentage: i18n.number(99.8, { maximumFractionDigits: 12 }),
    }),
    'Probabilité ≥ 99,8 %',
  );
  i18n.setLocale('en');
  assert.equal(
    i18n.t('probability.comparison', {
      operator: '<', percentage: i18n.number(100, { maximumFractionDigits: 12 }),
    }),
    'Probability < 100%',
  );
  const tiny = formatProbabilityDisplay(-5000, 'upper');
  assert.equal(tiny.value, 1e-12);
  assert.equal(i18n.number(tiny.value, { maximumFractionDigits: 12 }), '0.000000000001');
  i18n.setLocale('fr');
  assert.equal(i18n.number(tiny.value, { maximumFractionDigits: 12 }), '0,000000000001');
});
