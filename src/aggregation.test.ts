import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aggregateEvidence } from '@bycelium/evidence-diagrams';

const contributions = (weights: readonly number[]) =>
  weights.map((weightDecibans) => ({ weightDecibans }));

test('an empty list and neutral evidence produce a zero summary', () => {
  assert.deepEqual(aggregateEvidence([]), {
    netWeightDecibans: 0,
    absoluteWeightDecibans: 0,
    dissonance: 0,
  });
  assert.deepEqual(aggregateEvidence(contributions([0, 0])), {
    netWeightDecibans: 0,
    absoluteWeightDecibans: 0,
    dissonance: 0,
  });
});

test('aggregates signed and absolute weights with their dissonance', () => {
  assert.deepEqual(aggregateEvidence(contributions([12, -5, 0])), {
    netWeightDecibans: 7,
    absoluteWeightDecibans: 17,
    dissonance: 1 - 7 / 17,
  });
});

test('is symmetric across polarity', () => {
  const positive = aggregateEvidence(contributions([12, -5, 0]));
  const negative = aggregateEvidence(contributions([-12, 5, 0]));
  assert.equal(negative.netWeightDecibans, -positive.netWeightDecibans);
  assert.equal(negative.absoluteWeightDecibans, positive.absoluteWeightDecibans);
  assert.equal(negative.dissonance, positive.dissonance);
});

test('balanced opposition has complete dissonance', () => {
  assert.deepEqual(aggregateEvidence(contributions([9, -9])), {
    netWeightDecibans: 0,
    absoluteWeightDecibans: 18,
    dissonance: 1,
  });
});

test('preserves fractional values', () => {
  assert.deepEqual(aggregateEvidence(contributions([0.5, -0.25])), {
    netWeightDecibans: 0.25,
    absoluteWeightDecibans: 0.75,
    dissonance: 1 - 0.25 / 0.75,
  });
});

test('leaves cumulative weight unbounded', () => {
  assert.deepEqual(aggregateEvidence(contributions([40, 40])), {
    netWeightDecibans: 80,
    absoluteWeightDecibans: 80,
    dissonance: 0,
  });
});

test('keeps dissonance defined when sums exceed finite representation', () => {
  assert.deepEqual(aggregateEvidence(contributions([Number.MAX_VALUE, Number.MAX_VALUE])), {
    netWeightDecibans: Number.POSITIVE_INFINITY,
    absoluteWeightDecibans: Number.POSITIVE_INFINITY,
    dissonance: 0,
  });
  assert.deepEqual(aggregateEvidence(contributions([Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE])), {
    netWeightDecibans: Number.MAX_VALUE,
    absoluteWeightDecibans: Number.POSITIVE_INFINITY,
    dissonance: 1 - 1 / 3,
  });
});

test('accepts and preserves a frozen array', () => {
  const inputs = Object.freeze([
    Object.freeze({ weightDecibans: 12, reference: 'a' }),
    Object.freeze({ weightDecibans: -5, reference: 'b' }),
    Object.freeze({ weightDecibans: 0, reference: 'c' }),
  ]);
  assert.deepEqual(aggregateEvidence(inputs), {
    netWeightDecibans: 7,
    absoluteWeightDecibans: 17,
    dissonance: 1 - 7 / 17,
  });
  assert.deepEqual(inputs, [
    { weightDecibans: 12, reference: 'a' },
    { weightDecibans: -5, reference: 'b' },
    { weightDecibans: 0, reference: 'c' },
  ]);
});

test('rejects every non-finite contribution', () => {
  for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
    assert.throws(() => aggregateEvidence(contributions([1, invalid])), /finite/i);
  }
  assert.throws(() => aggregateEvidence([{ weightDecibans: '12' } as never]), /weightDecibans/);
  assert.throws(() => aggregateEvidence([{} as never]), /weightDecibans/);
});
