import assert from 'node:assert/strict';
import { test } from 'node:test';
import { decibansToProbability, probabilityToDecibans } from '@bycelium/evidence-diagrams';

test('converts reference probabilities to decibans', () => {
  assert.deepEqual(probabilityToDecibans({ probability: 0.5 }), { weightDecibans: 0 });
  assert.ok(Math.abs(probabilityToDecibans({ probability: 0.9 }).weightDecibans - 9.542425094393248) < 1e-12);
  assert.deepEqual(probabilityToDecibans({ probability: 0 }), { weightDecibans: Number.NEGATIVE_INFINITY });
  assert.deepEqual(probabilityToDecibans({ probability: 1 }), { weightDecibans: Number.POSITIVE_INFINITY });
});

test('round-trips probabilities stably', () => {
  for (const probability of [1e-300, 1e-12, 0.01, 0.25, 0.5, 0.9, 1 - 1e-12]) {
    const result = decibansToProbability(
      probabilityToDecibans({ probability }),
    ).probability;
    const relativeError = Math.abs((result - probability) / probability);
    assert.ok(relativeError < 1e-13, `${probability} has a relative error of ${relativeError}`);
  }
});

test('both conversions are symmetric', () => {
  for (const probability of [0.01, 0.1, 0.25, 0.9]) {
    const opposite = probabilityToDecibans({ probability: 1 - probability }).weightDecibans;
    const direct = probabilityToDecibans({ probability }).weightDecibans;
    assert.ok(Math.abs(opposite + direct) < 1e-12);
  }
  for (const weight of [0, 5, 20, 5000]) {
    const positive = decibansToProbability({ weightDecibans: weight }).probability;
    const negative = decibansToProbability({ weightDecibans: -weight }).probability;
    assert.ok(Math.abs(positive + negative - 1) < 1e-15);
  }
});

test('the inverse handles extreme weights without numeric overflow', () => {
  assert.deepEqual(decibansToProbability({ weightDecibans: Number.NEGATIVE_INFINITY }), { probability: 0 });
  assert.deepEqual(decibansToProbability({ weightDecibans: Number.POSITIVE_INFINITY }), { probability: 1 });
  assert.deepEqual(decibansToProbability({ weightDecibans: -5000 }), { probability: 0 });
  assert.deepEqual(decibansToProbability({ weightDecibans: 5000 }), { probability: 1 });
});

test('rejects out-of-range probabilities and undefined weights', () => {
  for (const invalid of [Number.NaN, Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY, -0.1, 1.1]) {
    assert.throws(() => probabilityToDecibans({ probability: invalid }), /probability/i);
  }
  assert.throws(() => decibansToProbability({ weightDecibans: Number.NaN }), /decibans/i);
  for (const invalid of ['0', null, undefined]) {
    assert.throws(() => decibansToProbability({ weightDecibans: invalid } as never), /decibans/i);
  }
  assert.throws(() => probabilityToDecibans(0.5 as never), /probability/i);
  assert.throws(() => decibansToProbability(0 as never), /decibans/i);
});
