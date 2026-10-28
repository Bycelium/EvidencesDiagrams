import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateEvidence, boundProbability, color, triangleColor, trianglePosition, probabilityToDecibans, DEFAULT_COLOR_OPTIONS } from '@bycelium/evidences-diagrams';

test('returns the four anchor colors', () => {
  assert.equal(color({ netWeightDecibans: 0, absoluteWeightDecibans: 0, dissonance: 0 }), '#9ca3af');
  assert.equal(color({ netWeightDecibans: 45, absoluteWeightDecibans: 45, dissonance: 0 }), '#22c55e');
  assert.equal(color({ netWeightDecibans: -45, absoluteWeightDecibans: 45, dissonance: 0 }), '#ef4444');
  assert.equal(color({ netWeightDecibans: 0, absoluteWeightDecibans: 30, dissonance: 1 }), '#eab308');
});

test('keeps weak balanced opposition close to gray', () => {
  assert.equal(color({ netWeightDecibans: 0, absoluteWeightDecibans: 6, dissonance: 1 }), '#aca68e');
});

test('treats omitted and explicit default options identically', () => {
  const summary = { netWeightDecibans: 12, absoluteWeightDecibans: 20, dissonance: 0.4 };
  assert.equal(color(summary), color(summary, DEFAULT_COLOR_OPTIONS));
});

test('lets a custom threshold change the saturation point', () => {
  const summary = { netWeightDecibans: 30, absoluteWeightDecibans: 30, dissonance: 0 };
  assert.equal(color(summary), '#5fb487');
  assert.equal(color(summary, { saturationThresholdDecibans: 15 }), '#22c55e');
});

test('keeps rounded interpolation with partial custom anchors', () => {
  const summary = { netWeightDecibans: 30, absoluteWeightDecibans: 30, dissonance: 0 };
  assert.equal(color(summary, {
    anchors: { gray: '#000000', green: '#ffffff' },
  }), '#808080');
});

test('preserves supplied frozen options and anchors', () => {
  const options = Object.freeze({
    saturationThresholdDecibans: 20,
    anchors: Object.freeze({ yellow: '#ffffff' }),
  });
  const copy = { saturationThresholdDecibans: 20, anchors: { yellow: '#ffffff' } };
  color({ netWeightDecibans: 0, absoluteWeightDecibans: 10, dissonance: 1 }, options);
  assert.deepEqual(options, copy);
});

test('rejects invalid saturation thresholds', () => {
  const summary = { netWeightDecibans: 1, absoluteWeightDecibans: 1, dissonance: 0 };
  for (const saturationThresholdDecibans of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => color(summary, { saturationThresholdDecibans }), /threshold/i);
  }
});

test('rejects anchors that are not RRGGBB hexadecimal colors', () => {
  const summary = { netWeightDecibans: 1, absoluteWeightDecibans: 1, dissonance: 0 };
  for (const green of ['22c55e', '#fff', '#gggggg', 123]) {
    assert.throws(() => color(summary, { anchors: { green } } as never), /green/i);
  }
});

const summary = (weight: number) => ({
  netWeightDecibans: weight, absoluteWeightDecibans: Math.abs(weight), dissonance: 0,
});
const anchors = DEFAULT_COLOR_OPTIONS.anchors;

test('keeps the center gray and saturates beyond the adverse prior', () => {
  for (const weight of [-15, -10, 0, 10, 15]) assert.equal(color(summary(weight)), anchors.gray);
  assert.equal(color(summary(30)), '#5fb487');
  assert.equal(color(summary(-30)), '#c6747a');
  assert.equal(color(summary(45)), anchors.green);
  assert.equal(color(summary(-45)), anchors.red);
  assert.equal(color(summary(450)), anchors.green);
});

test('visibly widens the gray region with the priors', () => {
  const fractions: number[] = [];
  for (const width of [0, 15, 30, 60]) {
    const options = { minPriorDecibans: -width, maxPriorDecibans: width };
    const boundary = trianglePosition(summary(width), options);
    fractions.push(boundary.x);
    assert.equal(triangleColor(boundary, options), anchors.gray);
    assert.notEqual(triangleColor({ x: boundary.x + 0.05, height: 0 }, options), anchors.gray);
  }
  assert.deepEqual(fractions, [0, 1 / 3, 1 / 2, 2 / 3]);
  const point = { x: 0.5, height: 0 };
  assert.notEqual(triangleColor(point), anchors.gray);
  assert.equal(triangleColor(point, { minPriorDecibans: -60, maxPriorDecibans: 60 }), anchors.gray);
});

test('colors absent evidence green with an exact 90% prior', () => {
  const prior = probabilityToDecibans({ probability: 0.9 }).weightDecibans;
  const options = { minPriorDecibans: prior, maxPriorDecibans: prior };
  const noEvidence = aggregateEvidence([]);
  assert.ok(trianglePosition(noEvidence, options).x > 0);
  assert.equal(color(noEvidence, options), '#75ae95');
  const exactNeutral = { minPriorDecibans: 0, maxPriorDecibans: 0 };
  assert.equal(color(noEvidence, exactNeutral), anchors.gray);
  assert.notEqual(color(summary(1), exactNeutral), anchors.gray);
  assert.notEqual(color(summary(-1), exactNeutral), anchors.gray);
});

test('translates the projection with an asymmetric prior and can reverse the shade', () => {
  const options = { minPriorDecibans: -60, maxPriorDecibans: -30 };
  assert.deepEqual(trianglePosition(summary(15), options), trianglePosition(summary(-30)));
  assert.equal(color(summary(15), options), color(summary(-30)));
  assert.equal(color(summary(0), options), anchors.red);
  assert.equal(color(summary(30), options), anchors.gray);
});

test('mixes conflict yellow with gray and directional regions', () => {
  assert.equal(color({ netWeightDecibans: 30, absoluteWeightDecibans: 60, dissonance: 0.5 }), '#a5b447');
  assert.equal(triangleColor({ x: 0, height: 1 }), anchors.yellow);
});

test('matches each summary color to the color at its position', () => {
  for (const prior of [0, 15, 60]) {
    const options = { minPriorDecibans: -prior, maxPriorDecibans: prior };
    for (const weights of [[], [5], [-60], [15, -5], [90, -60], [500, -500], [5000]]) {
      const result = aggregateEvidence(weights.map((weightDecibans) => ({ weightDecibans })));
      const position = trianglePosition(result, options);
      assert.ok(position.height >= 0 && position.height <= 1);
      assert.ok(Math.abs(position.x) <= 1 - position.height);
      assert.equal(color(result, options), triangleColor(position, options));
    }
  }
});

test('accepts extreme values and aggregation overflow', () => {
  const max = Number.MAX_VALUE;
  const options = { minPriorDecibans: -max, maxPriorDecibans: max, saturationThresholdDecibans: max };
  assert.deepEqual(trianglePosition(summary(max), options), { x: 0.5, height: 0 });
  assert.equal(color(summary(max), options), anchors.gray);
  assert.equal(color(summary(0), { minPriorDecibans: max, maxPriorDecibans: max, saturationThresholdDecibans: max }), anchors.green);
  assert.equal(color(summary(max), { minPriorDecibans: max / 2, maxPriorDecibans: max }), anchors.green);
  for (const weights of [[max, max], [-max, -max], [max, max, -max, -max], [max, max, -max]]) {
    const result = aggregateEvidence(weights.map((weightDecibans) => ({ weightDecibans })));
    const point = trianglePosition(result);
    assert.ok(Number.isFinite(point.x) && Number.isFinite(point.height));
    assert.match(color(result), /^#[0-9a-f]{6}$/u);
  }
  assert.equal(color(summary(max)), anchors.green);
  assert.equal(color(summary(-max)), anchors.red);
  assert.equal(color(summary(0), { saturationThresholdDecibans: Number.MIN_VALUE }), anchors.gray);
});

test('keeps extreme boundaries gray when the rounded radius reaches the half-width', () => {
  for (const width of [1e20, Number.MAX_VALUE]) {
    const options = { minPriorDecibans: -width, maxPriorDecibans: width };
    assert.equal(color(summary(width), options), anchors.gray);
    assert.equal(color(summary(-width), options), anchors.gray);
    assert.equal(triangleColor({ x: 1, height: 0 }, options), anchors.green);
    assert.equal(triangleColor({ x: -1, height: 0 }, options), anchors.red);
  }
});

test('shares prior validation with probability bounds', () => {
  for (const options of [null, { minPriorDecibans: NaN }, { maxPriorDecibans: Infinity },
    { minPriorDecibans: 2, maxPriorDecibans: 1 }, { minPriorDecibans: null }]) {
    for (const fn of [color, trianglePosition, boundProbability]) {
      assert.throws(() => fn(summary(1), options as never), /prior|options/i);
    }
    assert.throws(() => triangleColor({ x: 0, height: 0 }, options as never), /prior|options/i);
  }
});

test('rejects out-of-domain summaries and positions', () => {
  for (const result of [null, {}, summary(NaN), { ...summary(1), absoluteWeightDecibans: -1 },
    { ...summary(1), dissonance: NaN }, { ...summary(1), dissonance: 1.1 }]) {
    assert.throws(() => trianglePosition(result as never), /summary/i);
  }
  for (const position of [null, {}, { x: NaN, height: 0 }, { x: 0, height: Infinity },
    { x: 0, height: -0.1 }, { x: 0.6, height: 0.5 }]) {
    assert.throws(() => triangleColor(position as never), /position/i);
  }
});
