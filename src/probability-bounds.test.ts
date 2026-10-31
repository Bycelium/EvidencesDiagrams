import assert from 'node:assert/strict';
import { test } from 'node:test';
import { boundProbability, decibansToProbability } from '@bycelium/evidence-diagrams';
import type { EvidenceSummary } from '@bycelium/evidence-diagrams';

function summary(netWeightDecibans: number): EvidenceSummary {
  return { netWeightDecibans, absoluteWeightDecibans: Math.abs(netWeightDecibans), dissonance: 0 };
}

test('bounds positive and negative evidence with the default priors', () => {
  const positive = boundProbability(summary(20));
  assert.equal(positive.direction, 'lower');
  assert.equal(positive.text, 'Probability ≥ 75 %');
  assert.equal(positive.displayPercentage, 75);
  assert.equal(positive.probability, decibansToProbability({ weightDecibans: 5 }).probability);

  const negative = boundProbability(summary(-20));
  assert.equal(negative.direction, 'upper');
  assert.equal(negative.text, 'Probability ≤ 25 %');
  assert.equal(negative.displayPercentage, 25);
  assert.equal(negative.probability, decibansToProbability({ weightDecibans: -5 }).probability);
});

test('returns the expected conservative percentages at ±10 and ±15', () => {
  assert.equal(boundProbability(summary(10)).text, 'Probability ≥ 24 %');
  assert.equal(boundProbability(summary(-10)).text, 'Probability ≤ 76 %');
  assert.equal(boundProbability(summary(15)).text, 'Probability ≥ 50 %');
  assert.equal(boundProbability(summary(-15)).text, 'Probability ≤ 50 %');
});

test('chooses the guaranteed bound among several admissible priors', () => {
  const positive = boundProbability(summary(10));
  const negative = boundProbability(summary(-10));
  if (positive.direction === 'indeterminate' || negative.direction === 'indeterminate') {
    assert.fail('Nonzero weight must produce a probability bound.');
  }

  for (const prior of [-15, -10, 0, 15]) {
    const candidate = decibansToProbability({ weightDecibans: 10 + prior }).probability;
    assert.ok(positive.probability <= candidate, `Prior ${prior} must stay above the lower bound.`);
  }
  for (const prior of [-15, 0, 10, 15]) {
    const candidate = decibansToProbability({ weightDecibans: -10 + prior }).probability;
    assert.ok(negative.probability >= candidate, `Prior ${prior} must stay below the upper bound.`);
  }
});

test('accepts partial options and asymmetric bounds', () => {
  assert.equal(
    boundProbability(summary(20), { minPriorDecibans: -10 }).text,
    'Probability ≥ 90 %',
  );
  assert.equal(
    boundProbability(summary(-20), { maxPriorDecibans: -10 }).text,
    'Probability ≤ 0.1 %',
  );
  assert.equal(
    boundProbability(summary(-20), { minPriorDecibans: -30, maxPriorDecibans: 5 }).text,
    'Probability ≤ 4 %',
  );
});

test('returns an exact probability when priors are equal, including at zero', () => {
  const fixed = boundProbability(summary(10), { minPriorDecibans: -10, maxPriorDecibans: -10 });
  assert.deepEqual(fixed, {
    direction: 'exact',
    probability: 0.5,
    displayPercentage: 50,
    text: 'Probability = 50 %',
  });

  assert.deepEqual(
    boundProbability(summary(0), { minPriorDecibans: 0, maxPriorDecibans: 0 }),
    { direction: 'exact', probability: 0.5, displayPercentage: 50, text: 'Probability = 50 %' },
  );
  assert.equal(
    boundProbability(summary(10), { minPriorDecibans: 0, maxPriorDecibans: 0 }).text,
    'Probability = 91 %',
  );
  assert.equal(
    boundProbability(summary(-10), { minPriorDecibans: 0, maxPriorDecibans: 0 }).text,
    'Probability = 9 %',
  );
});

test('distinguishes absent evidence from dissonant evidence', () => {
  assert.deepEqual(boundProbability(summary(0)), {
    direction: 'indeterminate',
    reason: 'no-evidence',
    text: 'No evidence',
  });
  assert.deepEqual(boundProbability(summary(-0)), {
    direction: 'indeterminate',
    reason: 'no-evidence',
    text: 'No evidence',
  });
  assert.deepEqual(boundProbability({
    netWeightDecibans: 0,
    absoluteWeightDecibans: 18,
    dissonance: 1,
  }), {
    direction: 'indeterminate',
    reason: 'dissonant-evidence',
    text: 'Dissonant evidence',
  });
});

test('rounds each bound in the conservative direction', () => {
  assert.equal(
    boundProbability(summary(10), { minPriorDecibans: -5, maxPriorDecibans: 5 }).text,
    'Probability ≥ 75 %',
  );
  assert.equal(
    boundProbability(summary(-10), { minPriorDecibans: -5, maxPriorDecibans: 5 }).text,
    'Probability ≤ 25 %',
  );
});

test('adds precision near percentage endpoints while preserving conservative bounds', () => {
  assert.equal(boundProbability(summary(42)).text, 'Probability ≥ 99.8 %');
  assert.equal(boundProbability(summary(52)).text, 'Probability ≥ 99.98 %');
  assert.equal(boundProbability(summary(-42)).text, 'Probability ≤ 0.2 %');
  assert.equal(boundProbability(summary(-52)).text, 'Probability ≤ 0.02 %');
  assert.equal(
    boundProbability(summary(-42), { minPriorDecibans: -15, maxPriorDecibans: 69 }).text,
    'Probability ≤ 99.9 %',
  );
  assert.equal(
    boundProbability(summary(42), { minPriorDecibans: -69, maxPriorDecibans: 15 }).text,
    'Probability ≥ 0.1 %',
  );
  const lower = boundProbability(summary(1), {
    minPriorDecibans: 119.96875,
    maxPriorDecibans: 121.96875,
  });
  const upper = boundProbability(summary(-1), {
    minPriorDecibans: -121.96875,
    maxPriorDecibans: -119.96875,
  });
  if (lower.direction === 'indeterminate' || upper.direction === 'indeterminate') assert.fail('Expected bounds.');
  assert.equal(lower.text, 'Probability ≥ 99.99999999991 %');
  assert.ok(lower.displayPercentage <= lower.probability * 100);
  assert.ok(upper.displayPercentage >= upper.probability * 100);
  assert.equal(
    boundProbability(summary(1), { minPriorDecibans: 99, maxPriorDecibans: 101 }).text,
    'Probability ≥ 99.99999998 %',
  );
  assert.equal(boundProbability(summary(-99)).text, 'Probability ≤ 0.0000004 %');
});

test('preserves numeric extremes without finite claims of certainty', () => {
  assert.equal(
    boundProbability(summary(5000), { minPriorDecibans: -15 }).text,
    'Probability ≥ 99.999999999999 %',
  );
  assert.equal(
    boundProbability(summary(-5000), { maxPriorDecibans: 15 }).text,
    'Probability ≤ 0.000000000001 %',
  );
  assert.deepEqual(
    boundProbability(summary(Number.MAX_VALUE), {
      minPriorDecibans: Number.MAX_VALUE / 2,
      maxPriorDecibans: Number.MAX_VALUE,
    }),
    {
      direction: 'lower',
      probability: 1,
      displayPercentage: 99.999999999999,
      text: 'Probability ≥ 99.999999999999 %',
    },
  );
  assert.deepEqual(
    boundProbability(summary(-Number.MAX_VALUE), {
      minPriorDecibans: -Number.MAX_VALUE,
      maxPriorDecibans: -Number.MAX_VALUE / 2,
    }),
    {
      direction: 'upper',
      probability: 0,
      displayPercentage: 1e-12,
      text: 'Probability ≤ 0.000000000001 %',
    },
  );
  assert.deepEqual(
    boundProbability(summary(-5000), { minPriorDecibans: -15, maxPriorDecibans: 10000 }),
    {
      direction: 'upper',
      probability: 1,
      displayPercentage: 100,
      displayOperator: '<',
      text: 'Probability < 100 %',
    },
  );
  assert.deepEqual(
    boundProbability(summary(5000), { minPriorDecibans: -10000, maxPriorDecibans: 15 }),
    {
      direction: 'lower',
      probability: 0,
      displayPercentage: 0,
      displayOperator: '>',
      text: 'Probability > 0 %',
    },
  );
  assert.deepEqual(
    boundProbability(summary(5000), { minPriorDecibans: 0, maxPriorDecibans: 0 }),
    {
      direction: 'exact',
      probability: 1,
      displayPercentage: 99.999999999999,
      displayOperator: '≥',
      text: 'Probability ≥ 99.999999999999 %',
    },
  );
  assert.deepEqual(
    boundProbability(summary(-5000), { minPriorDecibans: 0, maxPriorDecibans: 0 }),
    {
      direction: 'exact',
      probability: 0,
      displayPercentage: 1e-12,
      displayOperator: '≤',
      text: 'Probability ≤ 0.000000000001 %',
    },
  );
  assert.equal(boundProbability(summary(Number.POSITIVE_INFINITY)).text, 'Probability ≥ 100 %');
  assert.equal(boundProbability(summary(Number.NEGATIVE_INFINITY)).text, 'Probability ≤ 0 %');
});

test('rejects invalid summaries and options', () => {
  assert.throws(() => boundProbability(null as never), /netWeightDecibans/i);
  for (const invalid of [undefined, null, '10', Number.NaN]) {
    assert.throws(() => boundProbability({ netWeightDecibans: invalid } as never), /netWeightDecibans/i);
  }
  for (const options of [
    { minPriorDecibans: Number.NaN },
    { maxPriorDecibans: Number.POSITIVE_INFINITY },
    { minPriorDecibans: 1, maxPriorDecibans: -1 },
    { minPriorDecibans: null },
    null,
  ]) {
    assert.throws(() => boundProbability(summary(1), options as never), /prior|options/i);
  }
  for (const absoluteWeightDecibans of [undefined, null, Number.NaN, -1]) {
    assert.throws(
      () => boundProbability({ netWeightDecibans: 0, absoluteWeightDecibans } as never),
      /absoluteWeightDecibans/i,
    );
  }
});
