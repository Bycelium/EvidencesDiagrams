import {
  DEFAULT_COLOR_OPTIONS,
  aggregateEvidence,
  jeffreysBand,
  buildEvidenceDiagram,
  color,
  triangleColor,
  decibansToProbability,
  trianglePosition,
} from '../dist/index.js';
import { buildGeometry } from './geometry.js';
import { drawDiagram } from './diagram-renderer.js';
import {
  addEvidence,
  CATEGORY_CATALOG,
  categoryDescription,
  categoryLabel,
  createCustomCategory,
  createDefaultCategories,
  createPresetCategory,
  evidencePresentation,
  removeCategory,
  validateCategoryName,
} from './category-state.js';
import { createI18n, DEFAULT_LOCALE, supportedLocales } from './i18n.js';

const SCENARIOS = [
  ['none', 'scenario.none', []],
  ['news-aggregator-for', 'scenario.newsAggregatorFor', [['news-aggregator', 'for']]],
  ['encyclopedia-for', 'scenario.encyclopediaFor', [['encyclopedia', 'for']]],
  ['news-report-for', 'scenario.newsReportFor', [['news-report', 'for']]],
  ['two-news-reports-for', 'scenario.twoNewsReportsFor', [
    ['news-report', 'for'], ['news-report', 'for'],
  ]],
  ['three-news-reports-for', 'scenario.threeNewsReportsFor', [
    ['news-report', 'for'], ['news-report', 'for'], ['news-report', 'for'],
  ]],
  ['scientific-study-for', 'scenario.scientificStudyFor', [['scientific-study', 'for']]],
  ['official-data-for', 'scenario.officialDataFor', [['official-data', 'for']]],
  ['official-document-for', 'scenario.officialDocumentFor', [['official-document', 'for']]],
  ['two-official-documents-for', 'scenario.twoOfficialDocumentsFor', [
    ['official-document', 'for'], ['official-document', 'for'],
  ]],
  ['news-report-against', 'scenario.newsReportAgainst', [['news-report', 'against']]],
  ['two-news-reports-against', 'scenario.twoNewsReportsAgainst', [
    ['news-report', 'against'], ['news-report', 'against'],
  ]],
  ['official-data-against', 'scenario.officialDataAgainst', [['official-data', 'against']]],
  ['news-report-for-against', 'scenario.newsReportForAgainst', [
    ['news-report', 'for'], ['news-report', 'against'],
  ]],
  ['official-data-against-two-news-reports-for', 'scenario.officialDataAgainstTwoNewsReportsFor', [
    ['official-data', 'against'], ['news-report', 'for'], ['news-report', 'for'],
  ]],
];

let viewportHeight = 300;
const BREAK_HEIGHT = 40;
const VERTICAL_PIXELS_PER_HORIZONTAL_PIXEL = 1 / 2;

function storedLocale() {
  try { return localStorage.getItem('evidences-diagrams.locale') ?? DEFAULT_LOCALE; } catch { return DEFAULT_LOCALE; }
}

const i18n = createI18n(storedLocale());
let categories = createDefaultCategories();
const categoryRows = document.querySelector('#category-rows');
const evidenceHistory = document.querySelector('#evidence-history');
const trajectorySummary = document.querySelector('#trajectory-summary');
const trajectoryEmpty = document.querySelector('#trajectory-empty');
const canvas = document.querySelector('#cone');
const context = canvas.getContext('2d', { alpha: true });
const rulerCanvas = document.querySelector('#cone-ruler');
const rulerContext = rulerCanvas.getContext('2d', { alpha: true });
const posteriorRulerCanvas = document.querySelector('#posterior-ruler');
const posteriorRulerContext = posteriorRulerCanvas.getContext('2d', { alpha: true });
const coneScroll = document.querySelector('#cone-scroll');
const coneWrap = document.querySelector('.cone-wrap');
const coneDescription = document.querySelector('#cone-description');
const resultantLabel = document.querySelector('#resultant-label');
const colorLegend = document.querySelector('#color-legend');
const legendCanvas = document.querySelector('#legend-triangle');
const legendContext = legendCanvas.getContext('2d', { alpha: true });
const saturationThreshold = document.querySelector('#saturation-threshold');
const saturationThresholdValue = document.querySelector('#saturation-threshold-value');
const minPriorDecibans = document.querySelector('#prior-min-decibans');
const maxPriorDecibans = document.querySelector('#prior-max-decibans');
const probability = document.querySelector('#probability');
const probabilityText = document.querySelector('#probability-text');
const probabilityDescription = document.querySelector('#probability-description');
const dissonanceMeasure = document.querySelector('.dissonance-measure');
const priorBoundsError = document.querySelector('#prior-bounds-error');
const visualization = document.querySelector('#visualization');
const colorSummary = document.querySelector('.color');
const priorPresets = document.querySelector('#prior-presets');
const priorHandles = [...document.querySelectorAll('[data-prior-handle]')];
const priorBand = document.querySelector('#prior-band');
const priorTrack = priorBand.parentElement;
const priorBandText = document.querySelector('#prior-band-text');
const posteriorBand = document.querySelector('#posterior-band');
const posteriorTrack = posteriorBand.parentElement;
const posteriorBandText = document.querySelector('#posterior-band-text');
const priorResultantCanvas = document.querySelector('#prior-resultant');
const priorResultantContext = priorResultantCanvas.getContext('2d', { alpha: true });
const diagramDetails = document.querySelector('#diagram-details');
const diagramDetailsToggle = document.querySelector('#diagram-details-toggle');
const axisGuides = Object.fromEntries(
  [...document.querySelectorAll('[data-axis-guide]')].map((guide) => [guide.dataset.axisGuide, guide]),
);
const anchorInputs = Object.fromEntries(
  ['gray', 'yellow', 'red', 'green'].map((name) => [
    name,
    document.querySelector(`#${name}-anchor`),
  ]),
);
const colorOptions = {
  saturationThresholdDecibans: DEFAULT_COLOR_OPTIONS.saturationThresholdDecibans,
  anchors: { ...DEFAULT_COLOR_OPTIONS.anchors },
  minPriorDecibans: DEFAULT_COLOR_OPTIONS.minPriorDecibans,
  maxPriorDecibans: DEFAULT_COLOR_OPTIONS.maxPriorDecibans,
};
const DEFAULT_PRIOR_BOUNDS = Object.freeze({
  minPriorDecibans: -15,
  maxPriorDecibans: 15,
});

let evidence = [];
let nextEvidenceId = 1;
let nextPresetCategoryId = 1;
let selectedEvidenceId = null;
let latestColor = color(aggregateEvidence([]), colorOptions);
let geometry;
let currentDiagram;
let diagramPriors;
let viewportWidth = 1;
let horizontalPixelsPerDeciban = 4;
let verticalPixelsPerDeciban = horizontalPixelsPerDeciban * VERTICAL_PIXELS_PER_HORIZONTAL_PIXEL;
let priorDrag = null;
let diagramDetailsExpanded = true;

function syncDiagramDetailsState() {
  diagramDetails.hidden = !diagramDetailsExpanded;
  diagramDetailsToggle.setAttribute('aria-expanded', String(diagramDetailsExpanded));
  diagramDetailsToggle.setAttribute(
    'aria-label',
    i18n.t(diagramDetailsExpanded ? 'diagram.collapseDetails' : 'diagram.expandDetails'),
  );
  diagramDetailsToggle.classList.toggle('is-expanded', diagramDetailsExpanded);
  coneWrap.classList.toggle('details-expanded', diagramDetailsExpanded);
  coneWrap.closest('.result')?.classList.toggle('diagram-expanded', diagramDetailsExpanded);
}

function setDiagramDetailsExpanded(expanded) {
  diagramDetailsExpanded = expanded;
  syncDiagramDetailsState();
  requestAnimationFrame(update);
}

function evidenceWeight(item) {
  const magnitude = evidencePresentation(item, categories, i18n.t).weight;
  return item.direction === 'for' ? magnitude : -magnitude;
}

function formatDeciban(value) {
  return i18n.number(Number(value.toFixed(1)), { maximumFractionDigits: 1 });
}

function formatSigned(value) {
  return `${value > 0 ? '+' : value < 0 ? '−' : ''}${formatDeciban(Math.abs(value))}`;
}

function formatDecibanPercentage(decibans) {
  const percentage = decibansToProbability({ weightDecibans: decibans }).probability;
  if (percentage >= .995) return `>${i18n.percent(.99, { maximumFractionDigits: 0 })}`;
  if (percentage <= .005) return `<${i18n.percent(.01, { maximumFractionDigits: 0 })}`;
  return i18n.percent(percentage, { maximumFractionDigits: 0 });
}

function formatPosteriorPercentage(decibans, direction) {
  const percentage = decibansToProbability({ weightDecibans: decibans }).probability * 100;
  const displayPercentage = direction === 'lower'
    ? Math.floor(percentage)
    : direction === 'upper'
      ? Math.ceil(percentage)
      : Math.round(percentage);
  const boundedPercentage = direction === 'lower'
    ? Math.min(displayPercentage, 99)
    : direction === 'upper'
      ? Math.max(displayPercentage, 1)
      : displayPercentage;
  return i18n.percent(boundedPercentage / 100, { maximumFractionDigits: 0 });
}

function axisColor(decibans) {
  return color({
    netWeightDecibans: decibans,
    absoluteWeightDecibans: Math.abs(decibans),
    dissonance: 0,
  }, { ...colorOptions, minPriorDecibans: 0, maxPriorDecibans: 0 });
}

function setBandCaption(element, {
  shortKey,
  fixedKey,
  rangeKey,
  minimum,
  maximum,
  minimumColor,
  maximumColor,
  suffixKey,
  formatMinimum = formatDecibanPercentage,
  formatMaximum = formatDecibanPercentage,
}) {
  const exact = minimum === maximum;
  const minimumValue = formatMinimum(minimum);
  const maximumValue = formatMaximum(maximum);
  const minimumMarkup = `<span class="band-caption-endpoint band-caption-minimum" style="color:${minimumColor}">${minimumValue}</span>`;
  const maximumMarkup = `<span class="band-caption-endpoint band-caption-maximum" style="color:${maximumColor}">${maximumValue}</span>`;
  const replacements = {
    minimum: minimumMarkup,
    maximum: maximumMarkup,
    value: minimumMarkup,
  };
  const messageKey = exact ? fixedKey : rangeKey;
  const suffix = suffixKey ? ` ${i18n.t(suffixKey)}` : '';
  const compactValues = exact
    ? minimumMarkup
    : `${minimumMarkup}<span class="band-range-separator">–</span>${maximumMarkup}`;
  const fullCaption = `${i18n.t(messageKey, replacements)}${suffix}`;
  element.innerHTML = `<span class="band-caption-compact" aria-hidden="true"><span class="band-caption-title">${i18n.t(shortKey)}</span><span class="band-caption-values${exact ? ' is-exact' : ''}">${compactValues}</span></span><span class="band-caption-full">${fullCaption}</span>`;
}

function syncPriorHandles() {
  if (!geometry || !currentDiagram) return;
  const bounds = {
    min: Number(minPriorDecibans.value),
    max: Number(maxPriorDecibans.value),
  };
  const clampToDomain = (value) => Math.max(
    geometry.minimum,
    Math.min(geometry.maximum, value),
  );
  const visibleMinimum = clampToDomain(bounds.min);
  const visibleMaximum = clampToDomain(bounds.max);
  const visibleRange = visibleMaximum - visibleMinimum;
  const gradientValues = [...new Set([
    visibleMinimum,
    visibleMaximum,
    Math.max(visibleMinimum, Math.min(visibleMaximum, -colorOptions.saturationThresholdDecibans)),
    Math.max(visibleMinimum, Math.min(visibleMaximum, 0)),
    Math.max(visibleMinimum, Math.min(visibleMaximum, colorOptions.saturationThresholdDecibans)),
  ])].sort((a, b) => a - b);
  const stops = gradientValues.map((value) => {
    const position = visibleRange === 0 ? 50 : (value - visibleMinimum) / visibleRange * 100;
    return `${axisColor(value)} ${position}%`;
  });
  priorBand.style.background = visibleRange === 0
    ? axisColor(visibleMinimum)
    : `linear-gradient(90deg, ${stops.join(', ')})`;
  const minimumColor = axisColor(bounds.min);
  const maximumColor = axisColor(bounds.max);
  setBandCaption(priorBandText, {
    shortKey: 'prior.short',
    fixedKey: 'prior.fixed',
    rangeKey: 'prior.range',
    minimum: bounds.min,
    maximum: bounds.max,
    minimumColor,
    maximumColor,
  });
  const xMin = (visibleMinimum - geometry.minimum) * horizontalPixelsPerDeciban;
  const xMax = (visibleMaximum - geometry.minimum) * horizontalPixelsPerDeciban;
  const bandLeft = Math.max(0, Math.min(viewportWidth, xMin));
  const bandRight = Math.max(0, Math.min(viewportWidth, xMax));
  const bandStart = Math.min(bandLeft, bandRight);
  const priorExact = bounds.min === bounds.max;
  const bandWidth = Math.max(2, Math.abs(bandRight - bandLeft));
  priorBand.style.left = `${bandStart}px`;
  priorBand.style.width = `${bandWidth}px`;
  priorBand.hidden = priorExact;
  priorTrack.classList.toggle('is-exact', priorExact);
  priorTrack.style.setProperty('--caret-x', `${bandStart}px`);
  priorTrack.style.setProperty('--prior-color', minimumColor);
  const handleWidth = priorHandles[0].getBoundingClientRect().width;
  const extraGap = priorExact ? 0 : Math.max(0, (handleWidth + 2 - (xMax - xMin)) / 2);
  let rawMinimumLeft = xMin - handleWidth / 2 - extraGap;
  let rawMaximumLeft = xMax - handleWidth / 2 + extraGap;
  let pairFits = rawMaximumLeft + handleWidth - rawMinimumLeft <= viewportWidth;
  let pairOffset = pairFits && rawMinimumLeft < 0
    ? -rawMinimumLeft
    : pairFits ? Math.min(0, viewportWidth - (rawMaximumLeft + handleWidth)) : 0;
  if (priorExact) {
    rawMinimumLeft = Math.max(0, Math.min(viewportWidth - handleWidth * 2, xMin - handleWidth));
    rawMaximumLeft = rawMinimumLeft + handleWidth;
    pairFits = true;
    pairOffset = 0;
  }
  for (const handle of priorHandles) {
    const key = handle.dataset.priorHandle;
    const x = (clampToDomain(bounds[key]) - geometry.minimum) * horizontalPixelsPerDeciban;
    const prior = bounds[key];
    handle.hidden = false;
    handle.textContent = '';
    const rawLeft = (key === 'min' ? rawMinimumLeft : rawMaximumLeft) + pairOffset;
    const left = pairFits
      ? rawLeft
      : Math.max(0, Math.min(viewportWidth - handleWidth, rawLeft));
    handle.style.left = `${left}px`;
    handle.style.setProperty('--prior-anchor', `${x - left}px`);
    handle.style.setProperty('--prior-color', axisColor(prior));
    handle.dataset.prior = key;
    const active = geometry.activeEndpoint?.side === (key === 'min' ? 'minimum' : 'maximum');
    handle.classList.toggle('is-active', active);
    handle.setAttribute('aria-current', String(active));
    handle.setAttribute('aria-valuenow', String(prior));
    handle.setAttribute('aria-valuetext', i18n.t('prior.value', {
      bound: i18n.t(key === 'min' ? 'prior.low' : 'prior.high'),
      decibans: formatSigned(prior),
      percentage: formatDecibanPercentage(prior),
    }));
    handle.setAttribute('aria-valuemin', String(Math.min(geometry.minimum, bounds.min)));
    handle.setAttribute('aria-valuemax', String(Math.max(geometry.maximum, bounds.max)));
  }
}

function syncPosteriorInterval() {
  if (!geometry || !currentDiagram) return;
  const interval = geometry.currentInterval;
  const exact = interval.minimum === interval.maximum;
  const clippedMinimum = interval.minimum < geometry.minimum;
  const clippedMaximum = interval.maximum > geometry.maximum;
  const visibleMinimum = Math.max(geometry.minimum, Math.min(geometry.maximum, interval.minimum));
  const visibleMaximum = Math.max(geometry.minimum, Math.min(geometry.maximum, interval.maximum));
  const left = (visibleMinimum - geometry.minimum) * horizontalPixelsPerDeciban;
  const right = (visibleMaximum - geometry.minimum) * horizontalPixelsPerDeciban;
  const minimumColor = axisColor(interval.minimum);
  const maximumColor = axisColor(interval.maximum);
  const formatMinimum = (value) => formatPosteriorPercentage(
    value,
    exact ? 'exact' : 'lower',
  );
  const formatMaximum = (value) => formatPosteriorPercentage(
    value,
    exact ? 'exact' : 'upper',
  );
  setBandCaption(posteriorBandText, {
    shortKey: 'posterior.short',
    fixedKey: 'posterior.fixed',
    rangeKey: 'posterior.range',
    minimum: interval.minimum,
    maximum: interval.maximum,
    minimumColor,
    maximumColor,
    formatMinimum,
    formatMaximum,
    suffixKey: interval.visible
      ? clippedMinimum || clippedMaximum ? 'posterior.clipped' : undefined
      : 'posterior.offscreen',
  });
  posteriorBand.hidden = !interval.visible || exact;
  posteriorBand.style.left = `${Math.min(left, right)}px`;
  posteriorBand.style.width = `${Math.max(2, Math.abs(right - left))}px`;
  const gradientValues = [...new Set([
    visibleMinimum,
    visibleMaximum,
    Math.max(visibleMinimum, Math.min(visibleMaximum, -colorOptions.saturationThresholdDecibans)),
    Math.max(visibleMinimum, Math.min(visibleMaximum, 0)),
    Math.max(visibleMinimum, Math.min(visibleMaximum, colorOptions.saturationThresholdDecibans)),
  ])].sort((a, b) => a - b);
  const visibleRange = visibleMaximum - visibleMinimum;
  const stops = gradientValues.map((value) => {
    const position = visibleRange === 0 ? 50 : (value - visibleMinimum) / visibleRange * 100;
    return `${axisColor(value)} ${position}%`;
  });
  posteriorBand.style.background = visibleRange === 0
    ? axisColor(visibleMinimum)
    : `linear-gradient(90deg, ${stops.join(', ')})`;
  posteriorTrack.classList.toggle('is-exact', exact && interval.visible);
  posteriorTrack.classList.toggle('is-clipped-minimum', clippedMinimum);
  posteriorTrack.classList.toggle('is-clipped-maximum', clippedMaximum);
  posteriorTrack.style.setProperty('--posterior-x', `${left}px`);
  posteriorTrack.style.setProperty('--posterior-minimum-color', minimumColor);
  posteriorTrack.style.setProperty('--posterior-maximum-color', maximumColor);
}

function syncAxisGuide(key, x, startY, endY, visible) {
  const guide = axisGuides[key];
  if (!guide) return;
  guide.hidden = !visible || endY <= startY;
  if (guide.hidden) return;
  const wrapBounds = coneWrap.getBoundingClientRect();
  guide.style.left = `${x}px`;
  guide.style.top = `${startY - wrapBounds.top}px`;
  guide.style.height = `${endY - startY}px`;
}

function syncAxisGuides() {
  if (!geometry) return;
  const wrapBounds = coneWrap.getBoundingClientRect();
  const rulerBounds = rulerCanvas.getBoundingClientRect();
  const posteriorRulerBounds = posteriorRulerCanvas.getBoundingClientRect();
  if (!diagramDetailsExpanded) {
    for (const [key, guide] of Object.entries(axisGuides)) {
      if (key !== 'zero-origin') guide.hidden = true;
    }
    const zeroOrigin = (0 - geometry.minimum) * horizontalPixelsPerDeciban;
    syncAxisGuide(
      'zero-origin',
      rulerBounds.left - wrapBounds.left + zeroOrigin,
      rulerBounds.bottom,
      posteriorRulerBounds.top,
      geometry.minimum <= 0 && geometry.maximum >= 0,
    );
    return;
  }
  const canvasBounds = canvas.getBoundingClientRect();
  const priorBounds = priorTrack.getBoundingClientRect();
  const posteriorBounds = posteriorTrack.getBoundingClientRect();
  const priorMinimum = (Math.max(geometry.minimum, Math.min(geometry.maximum, geometry.minPriorDecibans)) - geometry.minimum)
    * horizontalPixelsPerDeciban;
  const priorMaximum = (Math.max(geometry.minimum, Math.min(geometry.maximum, geometry.maxPriorDecibans)) - geometry.minimum)
    * horizontalPixelsPerDeciban;
  const interval = geometry.currentInterval;
  const posteriorMinimum = (Math.max(geometry.minimum, interval.minimum) - geometry.minimum)
    * horizontalPixelsPerDeciban;
  const posteriorMaximum = (Math.min(geometry.maximum, interval.maximum) - geometry.minimum)
    * horizontalPixelsPerDeciban;
  const canvasOffset = canvasBounds.left - wrapBounds.left;
  const exactPrior = geometry.minPriorDecibans === geometry.maxPriorDecibans;
  const exactPosterior = interval.minimum === interval.maximum;
  const zeroOrigin = (0 - geometry.minimum) * horizontalPixelsPerDeciban;
  syncAxisGuide(
    'zero-origin',
    canvasOffset + zeroOrigin,
    rulerBounds.bottom,
    canvasBounds.bottom,
    geometry.minimum <= 0 && geometry.maximum >= 0,
  );
  syncAxisGuide(
    'prior-min',
    canvasOffset + priorMinimum,
    priorBounds.top + priorBounds.height / 2,
    canvasBounds.top,
    geometry.minPriorDecibans >= geometry.minimum && geometry.minPriorDecibans <= geometry.maximum,
  );
  syncAxisGuide(
    'prior-max',
    canvasOffset + priorMaximum,
    priorBounds.top + priorBounds.height / 2,
    canvasBounds.top,
    !exactPrior && geometry.maxPriorDecibans >= geometry.minimum && geometry.maxPriorDecibans <= geometry.maximum,
  );
  syncAxisGuide(
    'posterior-min',
    canvasOffset + posteriorMinimum,
    canvasBounds.bottom,
    posteriorBounds.top + posteriorBounds.height / 2,
    interval.visible && interval.minimum >= geometry.minimum,
  );
  syncAxisGuide(
    'posterior-max',
    canvasOffset + posteriorMaximum,
    canvasBounds.bottom,
    posteriorBounds.top + posteriorBounds.height / 2,
    interval.visible && !exactPosterior && interval.maximum <= geometry.maximum,
  );
}

function syncBandCaptionPlacement() {
  if (!geometry) return;
  coneWrap.style.removeProperty('--band-caption-overlay-width');
  coneWrap.style.removeProperty('--band-caption-title-width');
  const compactCaptions = [...coneWrap.querySelectorAll('.band-caption-compact')];
  const titleWidth = Math.ceil(Math.max(
    ...compactCaptions.map((caption) => caption.querySelector('.band-caption-title')?.scrollWidth ?? 0),
    0,
  ));
  coneWrap.style.setProperty('--band-caption-title-width', `${titleWidth}px`);
  const captionWidth = Math.ceil(Math.max(...compactCaptions.map((caption) => {
    const parentStyle = getComputedStyle(caption.parentElement);
    return caption.scrollWidth
      + Number.parseFloat(parentStyle.paddingLeft)
      + Number.parseFloat(parentStyle.paddingRight);
  }), 0));
  coneWrap.style.setProperty('--band-caption-overlay-width', `${captionWidth}px`);
  const clamp = (value) => Math.max(geometry.minimum, Math.min(geometry.maximum, value));
  const priorMinimumX = (clamp(geometry.minPriorDecibans) - geometry.minimum) * horizontalPixelsPerDeciban;
  const priorMaximumX = (clamp(geometry.maxPriorDecibans) - geometry.minimum) * horizontalPixelsPerDeciban;
  const posteriorMinimumX = (clamp(geometry.currentInterval.minimum) - geometry.minimum) * horizontalPixelsPerDeciban;
  const posteriorMaximumX = (clamp(geometry.currentInterval.maximum) - geometry.minimum) * horizontalPixelsPerDeciban;
  const negative = geometry.totalWeight < 0;
  const edgeRoom = negative
    ? viewportWidth - Math.max(priorMaximumX, posteriorMaximumX)
    : Math.min(priorMinimumX, posteriorMinimumX);
  const captionsStacked = edgeRoom < captionWidth + 18;
  coneWrap.classList.toggle('captions-stacked', captionsStacked);
  if (!captionsStacked) {
    const wrapBounds = coneWrap.getBoundingClientRect();
    const priorBounds = priorTrack.getBoundingClientRect();
    const posteriorBounds = posteriorTrack.getBoundingClientRect();
    priorBandText.style.setProperty(
      '--band-caption-y',
      `${priorBounds.top - wrapBounds.top + priorBounds.height / 2}px`,
    );
    posteriorBandText.style.setProperty(
      '--band-caption-y',
      `${posteriorBounds.top - wrapBounds.top + posteriorBounds.height / 2}px`,
    );
  }
}

function setPriorFromHandle(key, prior) {
  const minimum = Number(minPriorDecibans.value);
  const maximum = Number(maxPriorDecibans.value);
  const integer = Math.round(prior);
  if (key === 'max') maxPriorDecibans.value = String(Math.max(minimum, integer));
  else minPriorDecibans.value = String(Math.min(maximum, integer));
  update();
}

function resizeCanvas(element, contextLocal, width, height) {
  const ratio = window.devicePixelRatio || 1;
  element.width = Math.max(1, Math.round(width * ratio));
  element.height = Math.max(1, Math.round(height * ratio));
  element.style.width = `${width}px`;
  element.style.height = `${height}px`;
  contextLocal.setTransform(ratio, 0, 0, ratio, 0, 0);
}

function drawColorLegend() {
  const width = Math.max(1, Math.min(260, Math.round(colorLegend.clientWidth - 32)));
  const height = Math.round(width * .66);
  resizeCanvas(legendCanvas, legendContext, width, height);
  const baseLeft = { x: 14, y: 25 };
  const baseRight = { x: width - 14, y: 25 };
  const apex = { x: width / 2, y: height - 25 };
  const halfBase = baseRight.x - apex.x;
  const triangleHeight = apex.y - baseLeft.y;
  for (let y = Math.ceil(baseLeft.y); y <= apex.y; y += 1) {
    const proportion = (y - baseLeft.y) / triangleHeight;
    const halfWidth = halfBase * (1 - proportion);
    for (let x = Math.ceil(apex.x - halfWidth); x <= Math.floor(apex.x + halfWidth); x += 1) {
      legendContext.fillStyle = triangleColor({
        x: (x - apex.x) / halfBase,
        height: proportion,
      }, colorOptions);
      legendContext.fillRect(x, y, 1, 1);
    }
  }
  legendContext.strokeStyle = '#334155'; legendContext.lineWidth = 1.5;
  legendContext.beginPath(); legendContext.moveTo(baseLeft.x, baseLeft.y); legendContext.lineTo(baseRight.x, baseRight.y); legendContext.lineTo(apex.x, apex.y); legendContext.closePath(); legendContext.stroke();
  const position = trianglePosition(currentDiagram.summary, colorOptions);
  const x = apex.x + position.x * halfBase;
  const y = baseLeft.y + position.height * triangleHeight;
  legendContext.beginPath(); legendContext.arc(x, y, 5, 0, Math.PI * 2);
  legendContext.fillStyle = currentDiagram.resultant.color; legendContext.fill();
  legendContext.strokeStyle = '#0f172a'; legendContext.lineWidth = 2; legendContext.stroke();
  legendContext.fillStyle = '#334155'; legendContext.font = '700 10px system-ui';
  legendContext.textAlign = 'left'; legendContext.fillText(i18n.t('palette.against'), 0, 10);
  legendContext.textAlign = 'center'; legendContext.fillText(i18n.t('palette.noEvidence'), width / 2, 10);
  legendContext.textAlign = 'right'; legendContext.fillText(i18n.t('palette.for'), width, 10);
  legendContext.textAlign = 'center'; legendContext.fillText(i18n.t('palette.dissonance'), apex.x, height - 5);
  legendContext.textAlign = 'start';
}

function drawVisualization() {
  if (!geometry) return;
  const priorRulerEndpoints = geometry.minPriorDecibans === geometry.maxPriorDecibans
    ? [{ weight: geometry.minPriorDecibans, label: formatDecibanPercentage(geometry.minPriorDecibans) }]
    : [geometry.minPriorDecibans, geometry.maxPriorDecibans].map((weight) => ({
      weight,
      label: formatDecibanPercentage(weight),
    }));
  const posteriorRulerEndpoints = geometry.currentInterval.minimum === geometry.currentInterval.maximum
    ? [{
      weight: geometry.currentInterval.minimum,
      label: formatPosteriorPercentage(geometry.currentInterval.minimum, 'exact'),
    }]
    : [{
      weight: geometry.currentInterval.minimum,
      label: formatPosteriorPercentage(geometry.currentInterval.minimum, 'lower'),
    }, {
      weight: geometry.currentInterval.maximum,
      label: formatPosteriorPercentage(geometry.currentInterval.maximum, 'upper'),
    }];
  drawDiagram({
    canvas, context, rulerCanvas, rulerContext, posteriorRulerCanvas, posteriorRulerContext,
    priorResultantCanvas, priorResultantContext, geometry, evidence,
    selectedEvidenceId, viewportWidth, viewportHeight, horizontalPixelsPerDeciban,
    colorOptions, priors: diagramPriors, latestColor,
    priorRulerEndpoints, posteriorRulerEndpoints,
    i18n,
  });
  canvas.dataset.stepCount = String(geometry.steps.length);
  canvas.dataset.moveCount = String(geometry.steps.filter(({ weightDecibans }) => weightDecibans !== 0).length);
  if (selectedEvidenceId === null) delete canvas.dataset.selectedEvidenceId;
  else canvas.dataset.selectedEvidenceId = String(selectedEvidenceId);
}

function displaySignedWeight(weight, direction) {
  const sign = direction === 'for' ? '+' : '−';
  return `${sign}${formatDeciban(Math.abs(weight))}`;
}

function createHistoryElement(item) {
  const element = document.createElement('li');
  const selectionButton = document.createElement('button');
  const name = document.createElement('span');
  const measurement = document.createElement('strong');
  const removeButton = document.createElement('button');

  element.className = 'history-item';
  element.dataset.evidenceId = String(item.id);
  element.dataset.direction = item.direction;
  selectionButton.type = 'button';
  selectionButton.className = 'evidence-step';
  name.className = 'step-name';
  measurement.className = 'step-measure';
  removeButton.type = 'button';
  removeButton.className = 'remove-evidence';
  removeButton.textContent = i18n.t('evidence.remove');
  removeButton.setAttribute('aria-label', i18n.t('evidence.removeAria', { number: item.id }));
  selectionButton.append(name, measurement);
  element.append(selectionButton, removeButton);

  selectionButton.addEventListener('click', () => {
    selectedEvidenceId = item.id;
    if (!diagramDetailsExpanded) {
      diagramDetailsExpanded = true;
      syncDiagramDetailsState();
    }
    update();
    if (!geometry || visualization.hidden) return;
    const step = geometry.steps.find(({ id }) => id === item.id);
    const breakItem = geometry.breaks.find(({ hiddenEvidenceIds }) => hiddenEvidenceIds.includes(item.id));
    const y = step?.visibleRibbon?.y2 ?? breakItem?.y ?? 0;
    requestAnimationFrame(() => {
      const canvasBounds = canvas.getBoundingClientRect();
      window.scrollTo({
        top: Math.max(0, window.scrollY + canvasBounds.top + y - window.innerHeight / 3),
        behavior: 'smooth',
      });
    });
  });
  removeButton.addEventListener('click', () => {
    const index = evidence.findIndex(({ id }) => id === item.id);
    evidence = evidence.filter(({ id }) => id !== item.id);
    const adjacentEvidence = evidence[Math.min(index, evidence.length - 1)];
    if (selectedEvidenceId === item.id) selectedEvidenceId = null;
    update();
    if (adjacentEvidence) {
      evidenceHistory
        .querySelector(`[data-evidence-id="${adjacentEvidence.id}"] .evidence-step`)
        .focus();
    }
  });

  return element;
}

function renderHistory() {
  const existingElements = new Map(
    [...evidenceHistory.children].map((element) => [Number(element.dataset.evidenceId), element]),
  );
  const reversedEvidence = [...evidence].reverse();
  for (let index = 0; index < reversedEvidence.length; index += 1) {
    const item = reversedEvidence[index];
    const element = existingElements.get(item.id)
      ?? createHistoryElement(item);
    const presentation = evidencePresentation(item, categories, i18n.t);
    const weight = evidenceWeight(item);
    const selectionButton = element.querySelector('.evidence-step');

    element.dataset.direction = item.direction;
    element.classList.toggle('selected', item.id === selectedEvidenceId);
    const number = evidence.findIndex(({ id }) => id === item.id) + 1;
    const removeButton = element.querySelector('.remove-evidence');
    removeButton.textContent = i18n.t('evidence.remove');
    removeButton.setAttribute('aria-label', i18n.t('evidence.removeAria', { number }));
    element.querySelector('.step-name').textContent = `${number}. ${presentation.label}`;
    element.querySelector('.step-measure').textContent = `${displaySignedWeight(
      weight,
      item.direction,
    )} dBan`;
    selectionButton.setAttribute(
      'aria-label',
      i18n.t('evidence.selectAria', {
        number,
        category: presentation.label,
        direction: i18n.t(`direction.${item.direction}`),
        weight: formatDeciban(weight),
      }),
    );
    selectionButton.setAttribute('aria-pressed', String(item.id === selectedEvidenceId));
    if (evidenceHistory.children[index] !== element) {
      evidenceHistory.insertBefore(element, evidenceHistory.children[index] ?? null);
    }
  }
  for (const element of existingElements.values()) {
    if (!evidence.some(({ id }) => id === Number(element.dataset.evidenceId))) element.remove();
  }
  trajectorySummary.textContent = evidence.length === 0
    ? i18n.t('measure.noEvidence')
    : i18n.t('evidence.count', { count: evidence.length });
  trajectoryEmpty.hidden = evidence.length > 0;
  evidenceHistory.hidden = evidence.length === 0;
}

function readPriorBounds() {
  let minimum = Number(minPriorDecibans.value);
  let maximum = Number(maxPriorDecibans.value);
  let error = '';

  if (Number.isFinite(minimum)) {
    minimum = Math.round(minimum);
    minPriorDecibans.value = String(minimum);
  }
  if (Number.isFinite(maximum)) {
    maximum = Math.round(maximum);
    maxPriorDecibans.value = String(maximum);
  }

  if (minPriorDecibans.value.trim() === '' || maxPriorDecibans.value.trim() === ''
    || !Number.isFinite(minimum) || !Number.isFinite(maximum)) {
    error = i18n.t('prior.finiteError');
  } else if (minimum > maximum) {
    error = i18n.t('prior.orderError');
  }

  const invalid = error !== '';
  for (const field of [minPriorDecibans, maxPriorDecibans]) {
    field.setAttribute('aria-invalid', String(invalid));
  }
  priorBoundsError.textContent = error;
  priorBoundsError.hidden = !invalid;
  if (invalid) return null;

  return { minPriorDecibans: minimum, maxPriorDecibans: maximum };
}

function localizedProbability(bound) {
  if (bound.direction === 'indeterminate') return i18n.t(`probability.${bound.reason}`);
  return i18n.t(`probability.${bound.direction}`, {
    percentage: i18n.number(bound.displayPercentage),
  });
}

function update() {
  const evidenceContributions = evidence.map((item) => ({
    id: item.id,
    weightDecibans: evidenceWeight(item),
  }));

  const priorBounds = readPriorBounds();
  if (priorBounds !== null) {
    colorOptions.minPriorDecibans = priorBounds.minPriorDecibans;
    colorOptions.maxPriorDecibans = priorBounds.maxPriorDecibans;
  }

  const invalidSummary = priorBounds === null ? aggregateEvidence(evidenceContributions) : null;
  if (priorBounds === null) {
    geometry = undefined;
    currentDiagram = undefined;
    colorLegend.hidden = true;
    renderHistory();
    document.querySelector('#dissonance').textContent = i18n.percent(invalidSummary.dissonance);
    probability.hidden = true;
    probabilityDescription.textContent = i18n.t('diagram.invalidProbability');
    visualization.hidden = true;
    colorSummary.hidden = true;
    for (const handle of priorHandles) handle.hidden = true;
    return;
  }

  const diagram = buildEvidenceDiagram(evidenceContributions, colorOptions);
  currentDiagram = diagram;
  const threshold = colorOptions.saturationThresholdDecibans;
  const localDomain = {
    minimumDecibans: -threshold,
    maximumDecibans: threshold,
  };
  const displayDiagram = {
    ...diagram,
    domain: priorDrag?.domain ?? localDomain,
  };
  const summary = diagram.summary;
  renderHistory();
  document.querySelector('#dissonance').textContent = i18n.percent(summary.dissonance);
  dissonanceMeasure.style.setProperty(
    '--measure-color',
    summary.dissonance > 0 ? colorOptions.anchors.yellow : colorOptions.anchors.gray,
  );
  const resultantBand = diagram.resultant.jeffreysBand;
  const bandLabel = i18n.t(`band.${resultantBand}`);
  const resultantWeight = summary.netWeightDecibans;
  coneWrap.classList.toggle('is-negative', resultantWeight < 0);
  const resultantText = resultantWeight === 0
    ? i18n.t('diagram.resultNone')
    : i18n.t('diagram.result', { band: bandLabel, weight: formatSigned(resultantWeight) });
  resultantLabel.textContent = resultantText;
  probability.hidden = false;
  probabilityText.textContent = localizedProbability(diagram.probability);
  const probabilityColor = diagram.probability.direction === 'lower' && diagram.probability.probability > .5
    ? 'green'
    : diagram.probability.direction === 'upper' && diagram.probability.probability < .5
      ? 'red'
      : diagram.probability.direction === 'exact' && diagram.probability.probability > .5
        ? 'green'
        : diagram.probability.direction === 'exact' && diagram.probability.probability < .5
          ? 'red'
          : 'gray';
  probability.style.setProperty('--measure-color', colorOptions.anchors[probabilityColor]);
  probabilityDescription.textContent = priorBounds.minPriorDecibans === priorBounds.maxPriorDecibans
    ? i18n.t('prior.exactDescription', { prior: formatDeciban(priorBounds.minPriorDecibans) })
    : i18n.t('prior.rangeDescription', {
      minimum: formatDeciban(priorBounds.minPriorDecibans),
      maximum: formatDeciban(priorBounds.maxPriorDecibans),
    });

  visualization.hidden = false;
  colorSummary.hidden = false;
  colorLegend.hidden = false;
  latestColor = diagram.resultant.color;
  resultantLabel.style.color = latestColor;
  drawColorLegend();
  const minimum = displayDiagram.domain.minimumDecibans;
  const maximum = displayDiagram.domain.maximumDecibans;
  const amplitude = maximum - minimum;
  viewportWidth = Math.max(1, Math.round(priorTrack.clientWidth || 340));
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || !Number.isFinite(amplitude) || amplitude <= 0) {
    priorBoundsError.textContent = i18n.t('diagram.invalidGeometry');
    priorBoundsError.hidden = false;
    visualization.hidden = true;
    geometry = undefined;
    return;
  }
  horizontalPixelsPerDeciban = viewportWidth / amplitude;
  verticalPixelsPerDeciban = horizontalPixelsPerDeciban * VERTICAL_PIXELS_PER_HORIZONTAL_PIXEL;
  diagramPriors = { minPriorDecibans: priorBounds.minPriorDecibans, maxPriorDecibans: priorBounds.maxPriorDecibans };
  geometry = buildGeometry(displayDiagram, {
    horizontalPixelsPerDeciban,
    verticalPixelsPerDeciban,
    breakHeight: BREAK_HEIGHT,
    minPriorDecibans: priorBounds.minPriorDecibans,
    maxPriorDecibans: priorBounds.maxPriorDecibans,
  });
  viewportHeight = summary.absoluteWeightDecibans === 0 ? 48 : Math.max(1, geometry.totalHeight);
  coneScroll.style.height = `${viewportHeight}px`;
  const adjustedWidth = Math.max(1, Math.round(priorTrack.clientWidth || 340));
  if (adjustedWidth !== viewportWidth) {
    viewportWidth = adjustedWidth;
    horizontalPixelsPerDeciban = viewportWidth / amplitude;
    verticalPixelsPerDeciban = horizontalPixelsPerDeciban * VERTICAL_PIXELS_PER_HORIZONTAL_PIXEL;
    geometry = buildGeometry(displayDiagram, {
      horizontalPixelsPerDeciban,
      verticalPixelsPerDeciban,
      breakHeight: BREAK_HEIGHT,
      minPriorDecibans: priorBounds.minPriorDecibans,
      maxPriorDecibans: priorBounds.maxPriorDecibans,
    });
  }
  canvas.dataset.minimum = String(geometry.minimum);
  canvas.dataset.maximum = String(geometry.maximum);
  canvas.dataset.posteriorMinimum = String(geometry.currentInterval.minimum);
  canvas.dataset.posteriorMaximum = String(geometry.currentInterval.maximum);
  canvas.dataset.envelopeMinimum = String(priorBounds.minPriorDecibans - summary.absoluteWeightDecibans);
  canvas.dataset.envelopeMaximum = String(priorBounds.maxPriorDecibans + summary.absoluteWeightDecibans);
  canvas.dataset.activePrior = geometry.activeEndpoint?.side ?? 'none';
  canvas.dataset.resultantStart = String(resultantWeight >= 0 ? priorBounds.minPriorDecibans : priorBounds.maxPriorDecibans);
  canvas.dataset.resultantEnd = String(resultantWeight >= 0
    ? priorBounds.minPriorDecibans + resultantWeight
    : priorBounds.maxPriorDecibans + resultantWeight);
  canvas.dataset.breakCount = String(geometry.breaks.length);
  canvas.dataset.breaks = JSON.stringify(geometry.breaks.map((breakItem) => ({
    side: breakItem.side,
    absoluteStart: breakItem.startAbsolute,
    absoluteEnd: breakItem.endAbsolute,
    gap: breakItem.absoluteGap,
    hiddenEvidenceIds: breakItem.hiddenEvidenceIds,
  })));
  document.querySelector('#hex').textContent = latestColor;
  document.querySelector('#swatch').style.backgroundColor = latestColor;
  const summaryLabel = i18n.t('diagram.summaryAria', { count: evidence.length });
  canvas.setAttribute(
    'aria-label',
    i18n.t('diagram.summaryDetails', {
      summary: summaryLabel,
      net: formatDeciban(summary.netWeightDecibans),
      absolute: formatDeciban(summary.absoluteWeightDecibans),
      dissonance: i18n.percent(summary.dissonance),
      band: bandLabel,
      color: latestColor,
    }),
  );
  const breakText = geometry.breaks.length === 0 ? i18n.t('diagram.noBreaks') : geometry.breaks.map((breakItem) => i18n.t('diagram.break', {
    side: i18n.t(`side.${breakItem.side}`), start: formatDeciban(breakItem.startAbsolute),
    end: formatDeciban(breakItem.endAbsolute), gap: formatDeciban(breakItem.absoluteGap),
    count: breakItem.hiddenEvidenceIds.length, ids: breakItem.hiddenEvidenceIds.join(', ') || '—',
  })).join(' ');
  const currentPosition = summary.netWeightDecibans === 0
    ? i18n.t('diagram.positionZero')
    : geometry.activeEndpoint?.visible
      ? i18n.t('diagram.positionVisible')
      : i18n.t('diagram.positionClipped');
  coneDescription.textContent = i18n.t('diagram.description', {
    net: formatDeciban(summary.netWeightDecibans), absolute: formatDeciban(summary.absoluteWeightDecibans),
    minimum: formatDeciban(minimum), maximum: formatDeciban(maximum),
    currentMinimum: formatDeciban(geometry.currentInterval.minimum), currentMaximum: formatDeciban(geometry.currentInterval.maximum),
    envelopeMinimum: formatDeciban(priorBounds.minPriorDecibans - summary.absoluteWeightDecibans),
    envelopeMaximum: formatDeciban(priorBounds.maxPriorDecibans + summary.absoluteWeightDecibans),
    activePrior: i18n.t(`side.${geometry.activeEndpoint?.side ?? 'none'}`),
    resultantStart: formatDeciban(Number(canvas.dataset.resultantStart)), resultantEnd: formatDeciban(Number(canvas.dataset.resultantEnd)),
    position: currentPosition, breaks: breakText,
  });
  drawVisualization();
  syncPriorHandles();
  syncPosteriorInterval();
  syncBandCaptionPlacement();
  syncAxisGuides();
}

function addEvidenceItem(categoryId, direction) {
  const category = categories.find(({ id }) => id === categoryId);
  if (!category) return;
  evidence = addEvidence(evidence, category, direction, nextEvidenceId);
  nextEvidenceId += 1;
  update();
}

function createWeightCell(category, label, direction) {
  const weight = category.weights[direction];
  const signedWeight = direction === 'for' ? weight : -weight;
  const directionLabel = i18n.t(`direction.${direction}`);
  const weightAria = i18n.t('evidence.weightAria', { direction: directionLabel, category: label });
  const addAria = i18n.t('evidence.addAria', { direction: directionLabel, category: label });
  const cell = document.createElement('td');
  cell.className = 'weight';
  cell.dataset.direction = direction;
  const setting = document.createElement('label');
  setting.className = 'weight-setting';
  const hiddenLabel = document.createElement('span');
  hiddenLabel.className = 'visually-hidden';
  hiddenLabel.textContent = weightAria;
  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '30';
  slider.step = '0.5';
  slider.value = String(weight);
  slider.dataset.direction = direction;
  const measurement = document.createElement('strong');
  const output = document.createElement('output');
  output.className = 'weight-output';
  output.textContent = displaySignedWeight(weight, direction);
  measurement.append(output, ' dBan');
  setting.append(hiddenLabel, slider, measurement);
  const actions = document.createElement('div');
  actions.className = 'weight-actions';
  const band = document.createElement('small');
  band.className = 'weight-band';
  band.textContent = i18n.t(`band.${jeffreysBand({ weightDecibans: signedWeight })}`);
  const addButton = document.createElement('button');
  addButton.type = 'button';
  addButton.className = 'add-evidence';
  addButton.dataset.direction = direction;
  addButton.setAttribute('aria-label', addAria);
  addButton.textContent = i18n.t(direction === 'for' ? 'evidence.addFor' : 'evidence.addAgainst');
  actions.append(band, addButton);
  cell.append(setting, actions);
  return cell;
}

function renderCategoryRows() {
  categoryRows.replaceChildren();
  for (const category of categories) {
    const label = categoryLabel(category, i18n.t);
    const description = categoryDescription(category, i18n.t);
    const removeLabel = i18n.t('category.removeAria', { category: label });
    const row = document.createElement('tr');
    row.dataset.categoryId = category.id;
    const heading = document.createElement('th');
    heading.scope = 'row';
    const categoryNameCell = document.createElement('div');
    categoryNameCell.className = 'category-name-cell';
    const categoryText = document.createElement('span');
    const categoryName = document.createElement('strong');
    categoryName.textContent = label;
    categoryText.append(categoryName);
    if (description) {
      const categoryHelp = document.createElement('small');
      categoryHelp.textContent = description;
      categoryText.append(categoryHelp);
    }
    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'remove-category';
    removeButton.setAttribute('aria-label', removeLabel);
    removeButton.title = removeLabel;
    removeButton.textContent = '×';
    categoryNameCell.append(categoryText, removeButton);
    heading.append(categoryNameCell);
    row.append(
      heading,
      createWeightCell(category, label, 'for'),
      createWeightCell(category, label, 'against'),
    );

    for (const slider of row.querySelectorAll('input[type="range"][data-direction]')) {
      slider.addEventListener('input', () => {
        const direction = slider.dataset.direction;
        const weight = Number(slider.value);
        const cell = slider.closest('.weight');
        category.weights[direction] = weight;
        cell.querySelector('.weight-output').textContent = displaySignedWeight(
          weight,
          direction,
        );
        cell.querySelector('.weight-band').textContent = i18n.t(`band.${jeffreysBand({
          weightDecibans: direction === 'for' ? weight : -weight,
        })}`);
        update();
      });
    }
    row.addEventListener('click', (event) => {
      const addButton = event.target.closest('.add-evidence[data-direction]');
      if (addButton) addEvidenceItem(category.id, addButton.dataset.direction);
      if (event.target.closest('.remove-category')) {
        ({ categories, evidence } = removeCategory(categories, evidence, category.id));
        if (!evidence.some(({ id }) => id === selectedEvidenceId)) selectedEvidenceId = null;
        renderCategoryRows();
        renderPresetOptions();
        update();
      }
    });
    categoryRows.append(row);
  }
}

function applyScenario(id) {
  const scenario = SCENARIOS.find(([scenarioId]) => scenarioId === id);
  if (!scenario) return;

  evidence = [];
  selectedEvidenceId = null;
  let restoredCategory = false;
  for (const [categoryDefinitionId, direction] of scenario[2]) {
    let category = categories.find(({ definitionId }) => definitionId === categoryDefinitionId);
    if (!category) {
      category = createPresetCategory(categoryDefinitionId, nextPresetCategoryId);
      nextPresetCategoryId += 1;
      categories.push(category);
      restoredCategory = true;
    }
    evidence = addEvidence(evidence, category, direction, nextEvidenceId);
    nextEvidenceId += 1;
  }
  if (restoredCategory) {
    renderCategoryRows();
    renderPresetOptions();
  }
  update();
}

function writeColorOptions(options) {
  saturationThreshold.value = String(options.saturationThresholdDecibans);
  saturationThresholdValue.textContent = i18n.number(options.saturationThresholdDecibans);
  for (const [name, input] of Object.entries(anchorInputs)) {
    input.value = options.anchors[name];
  }
}

function readColorOptions() {
  colorOptions.saturationThresholdDecibans = Number(saturationThreshold.value);
  saturationThresholdValue.textContent = i18n.number(Number(saturationThreshold.value));
  for (const [name, input] of Object.entries(anchorInputs)) {
    colorOptions.anchors[name] = input.value;
  }
}

function reset() {
  evidence = [];
  selectedEvidenceId = null;
  categories = createDefaultCategories();
  categoryName.value = '';
  categoryName.setAttribute('aria-invalid', 'false');
  categoryError.hidden = true;
  categoryError.textContent = '';
  delete categoryError.dataset.error;
  renderCategoryRows();
  renderPresetOptions();
  writeColorOptions(DEFAULT_COLOR_OPTIONS);
  readColorOptions();
  minPriorDecibans.value = String(DEFAULT_PRIOR_BOUNDS.minPriorDecibans);
  maxPriorDecibans.value = String(DEFAULT_PRIOR_BOUNDS.maxPriorDecibans);
  update();
}

const scenarioList = document.querySelector('#scenario-list');
const presetCategoryForm = document.querySelector('#preset-category-form');
const categoryPreset = document.querySelector('#category-preset');

function renderPresetOptions() {
  const previousValue = categoryPreset.value;
  categoryPreset.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = i18n.t('category.choosePreset');
  categoryPreset.append(placeholder);
  const activeDefinitions = new Set(categories.map(({ definitionId }) => definitionId));
  for (const definition of CATEGORY_CATALOG) {
    const definitionId = definition.id;
    if (activeDefinitions.has(definitionId)) continue;
    const option = document.createElement('option');
    option.value = definitionId;
    option.textContent = i18n.t(definition.labelKey);
    categoryPreset.append(option);
  }
  const preferred = [...categoryPreset.options].find((option) => (
    option.value === previousValue && !option.disabled
  ));
  categoryPreset.value = preferred?.value ?? '';
}

function renderScenarios() {
  scenarioList.replaceChildren();
  for (const [id, labelKey] of SCENARIOS) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.scenario = id;
    button.textContent = i18n.t(labelKey);
    scenarioList.append(button);
  }
}

function translateStaticUi() {
  document.documentElement.lang = i18n.meta.htmlLang;
  document.title = i18n.t('app.title');
  const description = i18n.t('app.description');
  document.querySelector('#meta-description').setAttribute('content', description);
  document.querySelector('#og-title').setAttribute('content', document.title);
  document.querySelector('#og-description').setAttribute('content', description);
  document.querySelector('#twitter-title').setAttribute('content', document.title);
  document.querySelector('#twitter-description').setAttribute('content', description);
  for (const element of document.querySelectorAll('[data-i18n]')) {
    element.textContent = i18n.t(element.dataset.i18n);
  }
  for (const element of document.querySelectorAll('[data-i18n-aria-label]')) {
    element.setAttribute('aria-label', i18n.t(element.dataset.i18nAriaLabel));
  }
  for (const element of document.querySelectorAll('[data-i18n-placeholder]')) {
    element.setAttribute('placeholder', i18n.t(element.dataset.i18nPlaceholder));
  }
  syncDiagramDetailsState();
}

const languageSelect = document.querySelector('#language');
for (const locale of supportedLocales) {
  const option = document.createElement('option');
  option.value = locale.id;
  option.textContent = locale.label;
  languageSelect.append(option);
}
languageSelect.value = i18n.locale;
languageSelect.addEventListener('change', () => {
  i18n.setLocale(languageSelect.value);
  languageSelect.value = i18n.locale;
  try { localStorage.setItem('evidences-diagrams.locale', i18n.locale); } catch { /* file:// and privacy modes may disable storage. */ }
  translateStaticUi();
  if (categoryError.dataset.error) {
    categoryError.textContent = i18n.t(`category.${categoryError.dataset.error}Error`);
  }
  renderCategoryRows();
  renderPresetOptions();
  renderScenarios();
  update();
  requestAnimationFrame(drawVisualization);
});

const categoryForm = document.querySelector('#category-form');
const categoryName = document.querySelector('#category-name');
const categoryError = document.querySelector('#category-error');
presetCategoryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!categoryPreset.value) return;
  const category = createPresetCategory(categoryPreset.value, nextPresetCategoryId);
  if (!category) return;
  nextPresetCategoryId += 1;
  categories.push(category);
  renderCategoryRows();
  renderPresetOptions();
  categoryRows.querySelector('tr:last-child input')?.focus();
});
categoryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const validation = validateCategoryName(categoryName.value, categories, i18n.t);
  if (validation) {
    categoryError.dataset.error = validation;
    categoryError.textContent = i18n.t(`category.${validation}Error`);
    categoryError.hidden = false;
    categoryName.setAttribute('aria-invalid', 'true');
    return;
  }
  categories.push(createCustomCategory(categoryName.value, categories));
  categoryName.value = '';
  categoryName.setAttribute('aria-invalid', 'false');
  categoryError.hidden = true;
  delete categoryError.dataset.error;
  renderCategoryRows();
  categoryRows.querySelector('tr:last-child input')?.focus();
});

scenarioList.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-scenario]');
  if (button) applyScenario(button.dataset.scenario);
});
document.querySelector('.palette').addEventListener('input', () => {
  readColorOptions();
  update();
});
document.querySelector('#reset').addEventListener('click', reset);
for (const field of [minPriorDecibans, maxPriorDecibans]) {
  field.addEventListener('input', () => {
    const value = Number(field.value);
    if (Number.isFinite(value)) field.value = String(Math.round(value));
    update();
  });
}

priorPresets.addEventListener('click', (event) => {
  const button = event.target.closest('button[data-prior-min]');
  if (!button) return;
  minPriorDecibans.value = button.dataset.priorMin;
  maxPriorDecibans.value = button.dataset.priorMax;
  update();
});

for (const handle of priorHandles) {
  handle.addEventListener('pointerdown', (event) => {
    if (!geometry || !event.isPrimary || event.button !== 0) return;
    const prior = Number(
      handle.dataset.prior === 'min' ? minPriorDecibans.value : maxPriorDecibans.value,
    );
    priorDrag = {
      domain: { minimumDecibans: geometry.minimum, maximumDecibans: geometry.maximum },
      clientX: event.clientX,
      prior,
      horizontalPixelsPerDeciban,
      key: Number(minPriorDecibans.value) === Number(maxPriorDecibans.value)
        ? null
        : handle.dataset.priorHandle,
    };
    handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove', (event) => {
    if (!priorDrag || !handle.hasPointerCapture(event.pointerId)) return;
    const delta = (event.clientX - priorDrag.clientX) / priorDrag.horizontalPixelsPerDeciban;
    if (priorDrag.key === null) {
      const next = Math.round(priorDrag.prior + delta);
      if (next === priorDrag.prior) return;
      priorDrag.key = next < priorDrag.prior ? 'min' : 'max';
    }
    setPriorFromHandle(priorDrag.key, priorDrag.prior + delta);
  });
  const finishDrag = (event) => {
    if (priorDrag === null) return;
    if (event?.pointerId !== undefined && handle.hasPointerCapture(event.pointerId)) {
      handle.releasePointerCapture(event.pointerId);
    }
    priorDrag = null;
    update();
  };
  handle.addEventListener('pointerup', finishDrag);
  handle.addEventListener('pointercancel', finishDrag);
  handle.addEventListener('lostpointercapture', finishDrag);
  handle.addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const key = handle.dataset.priorHandle;
    const stepSize = event.shiftKey ? 5 : 1;
    if (event.key === 'Home') setPriorFromHandle(key, geometry.minimum);
    else if (event.key === 'End') setPriorFromHandle(key, geometry.maximum);
    else {
      const prior = key === 'max' ? Number(maxPriorDecibans.value) : Number(minPriorDecibans.value);
      setPriorFromHandle(key, prior + (event.key === 'ArrowRight' ? stepSize : -stepSize));
    }
  });
}

diagramDetailsToggle.addEventListener('click', () => {
  setDiagramDetailsExpanded(!diagramDetailsExpanded);
});
window.addEventListener('resize', () => requestAnimationFrame(update));

translateStaticUi();
renderCategoryRows();
renderPresetOptions();
renderScenarios();
writeColorOptions(DEFAULT_COLOR_OPTIONS);
update();
