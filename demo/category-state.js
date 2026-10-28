const categoryDefinition = (id, labelKey, descriptionKey) => Object.freeze({
  id,
  labelKey,
  descriptionKey,
  initialWeights: Object.freeze({ for: 10, against: 10 }),
});

export const CATEGORY_CATALOG = Object.freeze([
  categoryDefinition('testimony', 'category.testimony', 'category.testimonyDescription'),
  categoryDefinition('news-report', 'category.newsReport', 'category.newsReportDescription'),
  categoryDefinition('fact-check', 'category.factCheck', 'category.factCheckDescription'),
  categoryDefinition('encyclopedia', 'category.encyclopedia', 'category.encyclopediaDescription'),
  categoryDefinition('official-document', 'category.officialDocument', 'category.officialDocumentDescription'),
  categoryDefinition('official-data', 'category.officialData', 'category.officialDataDescription'),
  categoryDefinition('scientific-study', 'category.scientificStudy', 'category.scientificStudyDescription'),
  categoryDefinition('news-aggregator', 'category.newsAggregator', 'category.newsAggregatorDescription'),
  categoryDefinition('observational-study', 'category.observationalStudy', 'category.observationalStudyDescription'),
  categoryDefinition('controlled-experiment', 'category.controlledExperiment', 'category.controlledExperimentDescription'),
  categoryDefinition('randomized-controlled-study', 'category.randomizedControlledStudy', 'category.randomizedControlledStudyDescription'),
  categoryDefinition('double-blind-randomized-study', 'category.doubleBlindStudy', 'category.doubleBlindStudyDescription'),
  categoryDefinition('independent-replication', 'category.independentReplication', 'category.independentReplicationDescription'),
  categoryDefinition('systematic-review', 'category.systematicReview', 'category.systematicReviewDescription'),
  categoryDefinition('meta-analysis', 'category.metaAnalysis', 'category.metaAnalysisDescription'),
]);

export const DEFAULT_CATEGORY_DEFINITION_IDS = Object.freeze([
  'testimony', 'news-report', 'fact-check', 'encyclopedia',
  'official-document', 'official-data', 'scientific-study',
]);

export function categoryDefinitionById(definitionId) {
  return CATEGORY_CATALOG.find(({ id }) => id === definitionId);
}

function instantiateCategory(definition, id) {
  return {
    id,
    definitionId: definition.id,
    labelKey: definition.labelKey,
    descriptionKey: definition.descriptionKey,
    customLabel: null,
    weights: { ...definition.initialWeights },
  };
}

export function createDefaultCategories() {
  return DEFAULT_CATEGORY_DEFINITION_IDS.map((definitionId) => (
    instantiateCategory(categoryDefinitionById(definitionId), `default-${definitionId}`)
  ));
}

export function createPresetCategory(definitionId, uniqueId) {
  const definition = categoryDefinitionById(definitionId);
  if (!definition) return null;
  return instantiateCategory(definition, `preset-${definitionId}-${uniqueId}`);
}

export function categoryLabel(category, translate) {
  return category.customLabel ?? translate(category.labelKey);
}

export function categoryDescription(category, translate) {
  return category.descriptionKey ? translate(category.descriptionKey) : '';
}

export function validateCategoryName(name, categories, translate) {
  const normalized = name.trim().toLocaleLowerCase();
  if (normalized === '') return 'blank';
  return categories.some((category) => (
    categoryLabel(category, translate).trim().toLocaleLowerCase() === normalized
  )) ? 'duplicate' : null;
}

export function createCustomCategory(name, categories) {
  const stem = name.trim().toLocaleLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'category';
  const used = new Set(categories.map(({ id }) => id));
  let id = `custom-${stem}`;
  let suffix = 2;
  while (used.has(id)) { id = `custom-${stem}-${suffix}`; suffix += 1; }
  return {
    id,
    definitionId: null,
    labelKey: null,
    descriptionKey: null,
    customLabel: name.trim(),
    weights: { for: 10, against: 10 },
  };
}

export function addEvidence(evidence, category, direction, id) {
  return [...evidence, {
    id,
    categoryId: category.id,
    direction,
    snapshotLabelKey: category.labelKey,
    snapshotCustomLabel: category.customLabel,
    snapshotWeight: category.weights[direction],
  }];
}

export function removeCategory(categories, evidence, categoryId) {
  const category = categories.find(({ id }) => id === categoryId);
  if (!category) return { categories, evidence };
  return {
    categories: categories.filter(({ id }) => id !== categoryId),
    evidence: evidence.map((item) => item.categoryId === categoryId ? {
      ...item,
      categoryId: null,
      snapshotLabelKey: category.labelKey,
      snapshotCustomLabel: category.customLabel,
      snapshotWeight: category.weights[item.direction],
    } : item),
  };
}

export function evidencePresentation(item, categories, translate) {
  const category = categories.find(({ id }) => id === item.categoryId);
  if (category) {
    return {
      label: categoryLabel(category, translate),
      weight: category.weights[item.direction],
    };
  }
  return {
    label: item.snapshotCustomLabel ?? translate(item.snapshotLabelKey),
    weight: item.snapshotWeight,
  };
}
