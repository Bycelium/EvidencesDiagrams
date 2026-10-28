import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addEvidence,
  createCustomCategory,
  createDefaultCategories,
  createPresetCategory,
  evidencePresentation,
  removeCategory,
  validateCategoryName,
} from './category-state.js';

const en = (key) => ({
  'category.testimony': 'Testimony',
  'category.observationalStudy': 'Observational study',
}[key] ?? key);
const fr = (key) => ({
  'category.testimony': 'Témoignage',
  'category.observationalStudy': 'Étude observationnelle',
}[key] ?? key);

test('the approachable defaults use uniform illustrative weights', () => {
  const categories = createDefaultCategories();
  assert.deepEqual(categories.map(({ definitionId }) => definitionId), [
    'testimony', 'news-report', 'fact-check', 'encyclopedia',
    'official-document', 'official-data', 'scientific-study',
  ]);
  assert.ok(categories.every(({ weights }) => weights.for === 10 && weights.against === 10));
});

test('category names reject blanks and duplicates and receive stable unique identifiers', () => {
  const categories = createDefaultCategories();
  assert.equal(validateCategoryName('  ', categories, en), 'blank');
  assert.equal(validateCategoryName(' testimony ', categories, en), 'duplicate');
  const first = createCustomCategory('Field note', categories);
  const second = createCustomCategory('Field note', [...categories, first]);
  assert.equal(first.id, 'custom-field-note');
  assert.equal(second.id, 'custom-field-note-2');
});

test('evidence shares a live weight and freezes it when its category is removed', () => {
  const categories = createDefaultCategories();
  const testimony = categories[0];
  let evidence = addEvidence([], testimony, 'for', 1);
  testimony.weights.for = 14;
  assert.deepEqual(evidencePresentation(evidence[0], categories, en), { label: 'Testimony', weight: 14 });
  ({ evidence } = removeCategory(categories, evidence, testimony.id));
  testimony.weights.for = 20;
  assert.deepEqual(evidencePresentation(evidence[0], [], en), { label: 'Testimony', weight: 14 });
  assert.deepEqual(evidencePresentation(evidence[0], [], fr), { label: 'Témoignage', weight: 14 });
});

test('custom labels stay literal after removal and language changes', () => {
  const category = createCustomCategory('Field note <one> "two" & \'three\'', []);
  let evidence = addEvidence([], category, 'against', 1);
  category.weights.against = 12;
  ({ evidence } = removeCategory([category], evidence, category.id));
  assert.deepEqual(evidencePresentation(evidence[0], [], fr), {
    label: 'Field note <one> "two" & \'three\'',
    weight: 12,
  });
});

test('removing and readding a preset isolates archived evidence', () => {
  const first = createPresetCategory('observational-study', 1);
  first.weights.for = 16;
  let evidence = addEvidence([], first, 'for', 1);
  ({ evidence } = removeCategory([first], evidence, first.id));
  const second = createPresetCategory('observational-study', 2);
  second.weights.for = 7;
  assert.notEqual(first.id, second.id);
  assert.deepEqual(evidencePresentation(evidence[0], [second], en), {
    label: 'Observational study', weight: 16,
  });
});

test('a removed default can be readded as a new catalog instance', () => {
  const original = createDefaultCategories().find(({ definitionId }) => definitionId === 'news-report');
  const readded = createPresetCategory('news-report', 7);
  assert.equal(readded.definitionId, original.definitionId);
  assert.notEqual(readded.id, original.id);
  assert.deepEqual(readded.weights, { for: 10, against: 10 });
});
