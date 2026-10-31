import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  DEFAULT_COLOR_OPTIONS,
  aggregateEvidence,
  color,
  triangleColor,
  trianglePosition,
} from '../dist/index.js';
import { createLegendProjection } from './color-legend.js';

function projectionOptions(options = {}) {
  return {
    minPriorDecibans: options.minPriorDecibans ?? DEFAULT_COLOR_OPTIONS.minPriorDecibans,
    maxPriorDecibans: options.maxPriorDecibans ?? DEFAULT_COLOR_OPTIONS.maxPriorDecibans,
    saturationThresholdDecibans: options.saturationThresholdDecibans
      ?? DEFAULT_COLOR_OPTIONS.saturationThresholdDecibans,
  };
}

test('the gray top width follows the prior interval and collapses for an exact prior', () => {
  const exact = createLegendProjection(projectionOptions({
    minPriorDecibans: 20,
    maxPriorDecibans: 20,
  }));
  const defaults = createLegendProjection(projectionOptions());
  const wide = createLegendProjection(projectionOptions({
    minPriorDecibans: -60,
    maxPriorDecibans: 60,
  }));

  assert.equal(exact.topHalfWidth, 0);
  assert.equal(defaults.topHalfWidth, 3 / 7);
  assert.equal(wide.topHalfWidth, 3 / 4);
  assert.equal(defaults.halfWidthAt(0), 3 / 7);
  assert.equal(defaults.halfWidthAt(1), 1);
});

test('the bottom edge reaches the directional and dissonance anchors', () => {
  const options = projectionOptions();
  const projection = createLegendProjection(options);

  assert.equal(triangleColor(projection.colorPosition({ x: -1, height: 1 })), '#ef4444');
  assert.equal(triangleColor(projection.colorPosition({ x: 0, height: 1 })), '#eab308');
  assert.equal(triangleColor(projection.colorPosition({ x: 1, height: 1 })), '#22c55e');
  for (const x of [-projection.topHalfWidth, 0, projection.topHalfWidth]) {
    assert.equal(
      triangleColor(projection.colorPosition({ x, height: 0 }), options),
      DEFAULT_COLOR_OPTIONS.anchors.gray,
    );
  }
});

test('projected summary markers retain their resultant color', () => {
  const cases = [
    {},
    { minPriorDecibans: 20, maxPriorDecibans: 20 },
    { minPriorDecibans: -60, maxPriorDecibans: -30 },
    { minPriorDecibans: -5, maxPriorDecibans: 35, saturationThresholdDecibans: 12 },
    {
      minPriorDecibans: -15,
      maxPriorDecibans: 15,
      saturationThresholdDecibans: 45,
      anchors: { gray: '#101820', yellow: '#f0c808', red: '#c1121f', green: '#008148' },
    },
  ];
  const evidenceSets = [[], [5], [-60], [15, -5], [90, -60], [500, -500], [5000]];

  for (const options of cases) {
    const projection = createLegendProjection(projectionOptions(options));
    for (const weights of evidenceSets) {
      const summary = aggregateEvidence(weights.map((weightDecibans) => ({ weightDecibans })));
      const marker = projection.legendPosition(trianglePosition(summary, options));
      assert.ok(Math.abs(marker.x) <= projection.halfWidthAt(marker.height) + Number.EPSILON);
      assert.equal(
        triangleColor(projection.colorPosition(marker), options),
        color(summary, options),
      );
    }
  }
});

test('a shifted exact prior moves an absent-evidence marker below the gray apex', () => {
  const options = { minPriorDecibans: 20, maxPriorDecibans: 20 };
  const projection = createLegendProjection(projectionOptions(options));
  const summary = aggregateEvidence([]);
  const marker = projection.legendPosition(trianglePosition(summary, options));

  assert.equal(projection.topHalfWidth, 0);
  assert.ok(marker.x > 0);
  assert.ok(marker.height > 0);
  assert.equal(triangleColor(projection.colorPosition(marker), options), color(summary, options));
});

test('the projection preserves colors when the top width rounds to one', () => {
  const maximum = Number.MAX_VALUE;
  for (const priorHalfWidth of [1e20, maximum]) {
    const options = {
      minPriorDecibans: -priorHalfWidth,
      maxPriorDecibans: priorHalfWidth,
    };
    const projection = createLegendProjection(projectionOptions(options));
    const summaries = [
      { netWeightDecibans: priorHalfWidth, absoluteWeightDecibans: priorHalfWidth, dissonance: 0 },
      { netWeightDecibans: -priorHalfWidth, absoluteWeightDecibans: priorHalfWidth, dissonance: 0 },
      { netWeightDecibans: maximum, absoluteWeightDecibans: maximum, dissonance: 0 },
    ];

    assert.equal(projection.topHalfWidth, 1);
    for (const summary of summaries) {
      const marker = projection.legendPosition(trianglePosition(summary, options));
      assert.ok(Number.isFinite(marker.x) && Number.isFinite(marker.height));
      assert.equal(triangleColor(projection.colorPosition(marker), options), color(summary, options));
    }
  }
});

test('the projection remains finite at extreme saturation thresholds', () => {
  const maximum = Number.MAX_VALUE;
  const cases = [
    {
      options: {
        minPriorDecibans: -maximum,
        maxPriorDecibans: maximum,
        saturationThresholdDecibans: maximum,
      },
      summary: { netWeightDecibans: maximum, absoluteWeightDecibans: maximum, dissonance: 0 },
    },
    {
      options: {
        minPriorDecibans: 0,
        maxPriorDecibans: 0,
        saturationThresholdDecibans: Number.MIN_VALUE,
      },
      summary: { netWeightDecibans: Number.MIN_VALUE, absoluteWeightDecibans: Number.MIN_VALUE, dissonance: 0 },
    },
  ];

  for (const { options, summary } of cases) {
    const projection = createLegendProjection(options);
    const marker = projection.legendPosition(trianglePosition(summary, options));
    assert.ok(Number.isFinite(projection.topHalfWidth));
    assert.ok(Number.isFinite(marker.x) && Number.isFinite(marker.height));
    assert.equal(triangleColor(projection.colorPosition(marker), options), color(summary, options));
  }
});
