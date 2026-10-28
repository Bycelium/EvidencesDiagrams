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
  'category.officialDocument': 'Official document',
  'category.observationalStudy': 'Observational study',
}[key] ?? key);
const fr = (key) => ({
  'category.officialDocument': 'Texte officiel',
  'category.observationalStudy': 'Étude observationnelle',
}[key] ?? key);

test('category names reject blanks and duplicates and receive stable unique identifiers', () => {
  const categories = createDefaultCategories();
  assert.equal(validateCategoryName('  ', categories, en), 'blank');
  assert.equal(validateCategoryName(' official document ', categories, en), 'duplicate');
  const first = createCustomCategory('Field note', categories);
  const second = createCustomCategory('Field note', [...categories, first]);
  assert.equal(first.id, 'custom-field-note');
  assert.equal(second.id, 'custom-field-note-2');
});

test('evidence shares a live weight and freezes it when its category is removed', () => {
  const categories = createDefaultCategories();
  const officialDocument = categories[0];
  let evidence = addEvidence([], officialDocument, 'for', 1);
  officialDocument.weights.for = 14;
  assert.deepEqual(evidencePresentation(evidence[0], categories, en), { label: 'Official document', weight: 14 });
  ({ evidence } = removeCategory(categories, evidence, officialDocument.id));
  officialDocument.weights.for = 20;
  assert.deepEqual(evidencePresentation(evidence[0], [], en), { label: 'Official document', weight: 14 });
  assert.deepEqual(evidencePresentation(evidence[0], [], fr), { label: 'Texte officiel', weight: 14 });
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
  assert.deepEqual(readded.weights, { for: 5, against: 5 });
});
