import assert from 'node:assert/strict';
import { test } from 'node:test';
import { jeffreysBand } from '@bycelium/evidence-diagrams';

const band = (weightDecibans: number) => jeffreysBand({ weightDecibans });

test('zero corresponds to no weight of evidence', () => {
  assert.equal(band(0), 'none');
});

test('rejects undefined weight without silently classifying it as decisive', () => {
  assert.throws(() => band(Number.NaN), /decibans/i);
  assert.throws(() => jeffreysBand({ weightDecibans: '10' } as never), /decibans/i);
  assert.throws(() => jeffreysBand(10 as never), /decibans/i);
  assert.equal(band(Number.POSITIVE_INFINITY), 'decisive');
  assert.equal(band(Number.NEGATIVE_INFINITY), 'decisive against');
});

test('describes each band in both directions', () => {
  const cases = [
    [1, 'anecdotal'],
    [5, 'moderate'],
    [10, 'strong'],
    [15, 'very strong'],
    [20, 'decisive'],
  ] as const;
  for (const [weight, label] of cases) {
    assert.equal(band(weight), label);
    assert.equal(band(-weight), `${label} against`);
  }
});

test('respects values immediately below, at, and above each threshold', () => {
  const epsilon = 1e-9;
  const cases = [
    [5, 'anecdotal', 'moderate'],
    [10, 'moderate', 'strong'],
    [15, 'strong', 'very strong'],
    [20, 'very strong', 'decisive'],
  ] as const;
  for (const [threshold, below, fromThreshold] of cases) {
    assert.equal(band(threshold - epsilon), below);
    assert.equal(band(threshold), fromThreshold);
    assert.equal(band(threshold + epsilon), fromThreshold);
    assert.equal(band(-(threshold - epsilon)), `${below} against`);
    assert.equal(band(-threshold), `${fromThreshold} against`);
    assert.equal(band(-(threshold + epsilon)), `${fromThreshold} against`);
  }
});
