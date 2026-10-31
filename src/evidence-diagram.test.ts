import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  aggregateEvidence,
  buildEvidenceDiagram,
  type EvidenceContribution,
} from '@bycelium/evidence-diagrams';

test('builds the raw cumulative path in chronological order', () => {
  const diagram = buildEvidenceDiagram([
    { id: 'first', weightDecibans: 12 },
    { id: 2, weightDecibans: -5 },
  ]);

  assert.deepEqual(diagram.steps, [
    {
      id: 'first',
      weightDecibans: 12,
      start: { netWeightDecibans: 0, absoluteWeightDecibans: 0 },
      end: { netWeightDecibans: 12, absoluteWeightDecibans: 12 },
    },
    {
      id: 2,
      weightDecibans: -5,
      start: { netWeightDecibans: 12, absoluteWeightDecibans: 12 },
      end: { netWeightDecibans: 7, absoluteWeightDecibans: 17 },
    },
  ]);
  assert.deepEqual(diagram.summary, {
    netWeightDecibans: 7,
    absoluteWeightDecibans: 17,
    dissonance: 1 - 7 / 17,
  });
  assert.deepEqual(diagram.resultant.start, {
    netWeightDecibans: 0,
    absoluteWeightDecibans: 17,
  });
  assert.deepEqual(diagram.resultant.end, {
    netWeightDecibans: 7,
    absoluteWeightDecibans: 17,
  });
});

test('describes empty and stationary diagrams', () => {
  const empty = buildEvidenceDiagram([]);
  assert.deepEqual(empty.summary, {
    netWeightDecibans: 0,
    absoluteWeightDecibans: 0,
    dissonance: 0,
  });
  assert.deepEqual(empty.steps, []);
  assert.deepEqual(empty.probability, {
    direction: 'indeterminate',
    reason: 'no-evidence',
    text: 'No evidence',
  });
  assert.deepEqual(empty.resultant, {
    start: { netWeightDecibans: 0, absoluteWeightDecibans: 0 },
    end: { netWeightDecibans: 0, absoluteWeightDecibans: 0 },
    jeffreysBand: 'none',
    color: '#9ca3af',
  });

  const stationary = buildEvidenceDiagram([{ id: 'zero', weightDecibans: 0 }]);
  assert.equal(stationary.steps.length, 1);
  assert.deepEqual(stationary.steps[0]?.start, stationary.steps[0]?.end);
  assert.deepEqual(stationary.summary, empty.summary);

  const dissonant = buildEvidenceDiagram([
    { id: 'for', weightDecibans: 9 },
    { id: 'against', weightDecibans: -9 },
  ]);
  assert.deepEqual(dissonant.probability, {
    direction: 'indeterminate',
    reason: 'dissonant-evidence',
    text: 'Dissonant evidence',
  });
});

test('includes the probability bound and resultant Jeffreys band', () => {
  const diagram = buildEvidenceDiagram([{ id: 1, weightDecibans: 10 }], {
    minPriorDecibans: -10,
    maxPriorDecibans: -10,
  });
  assert.deepEqual(diagram.probability, {
    direction: 'exact',
    probability: 0.5,
    displayPercentage: 50,
    text: 'Probability = 50 %',
  });
  assert.equal(diagram.resultant.jeffreysBand, 'strong');
});

test('applies a custom palette to the resultant color', () => {
  const diagram = buildEvidenceDiagram([{ id: 'blue', weightDecibans: 5 }], {
    minPriorDecibans: 0,
    maxPriorDecibans: 0,
    saturationThresholdDecibans: 5,
    anchors: { green: '#0000ff' },
  });
  assert.equal(diagram.resultant.color, '#0000ff');
});

test('shares stable and extreme sums with aggregation', () => {
  const sequences = [
    [12, -5, 0, 2.5],
    [Number.MAX_VALUE, Number.MAX_VALUE],
    [Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE],
    [Number.MAX_VALUE, Number.MAX_VALUE, -Number.MAX_VALUE, -Number.MAX_VALUE],
  ];

  for (const weights of sequences) {
    const contributions = weights.map((weightDecibans, id) => ({ id, weightDecibans }));
    const diagram = buildEvidenceDiagram(contributions);
    assert.deepEqual(
      diagram.summary,
      aggregateEvidence(contributions),
    );
    for (let index = 0; index < contributions.length; index += 1) {
      const prefix = aggregateEvidence(contributions.slice(0, index + 1));
      assert.deepEqual(diagram.steps[index]?.end, {
        netWeightDecibans: prefix.netWeightDecibans,
        absoluteWeightDecibans: prefix.absoluteWeightDecibans,
      });
    }
  }
});

test('preserves frozen inputs and produces JSON-serializable data', () => {
  const contributions = Object.freeze([
    Object.freeze({ id: 'a', weightDecibans: 12, source: 'archive' }),
    Object.freeze({ id: 2, weightDecibans: -5, source: 'field' }),
  ]);
  const options = Object.freeze({
    minPriorDecibans: -20,
    maxPriorDecibans: 10,
    anchors: Object.freeze({ yellow: '#ffff00' }),
  });

  const diagram = buildEvidenceDiagram(contributions, options);
  assert.deepEqual(contributions, [
    { id: 'a', weightDecibans: 12, source: 'archive' },
    { id: 2, weightDecibans: -5, source: 'field' },
  ]);
  assert.deepEqual(options, {
    minPriorDecibans: -20,
    maxPriorDecibans: 10,
    anchors: { yellow: '#ffff00' },
  });
  assert.deepEqual(JSON.parse(JSON.stringify(diagram)), diagram);
});

test('rejects missing, non-finite, and duplicate ids', () => {
  for (const id of [undefined, null, true, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(
      () => buildEvidenceDiagram([{ id, weightDecibans: 1 }] as never),
      /id/i,
    );
  }
  assert.throws(
    () => buildEvidenceDiagram([
      { id: 'same', weightDecibans: 1 },
      { id: 'same', weightDecibans: 2 },
    ]),
    /duplicated/i,
  );
  assert.throws(
    () => buildEvidenceDiagram([
      { id: 0, weightDecibans: 1 },
      { id: -0, weightDecibans: 2 },
    ]),
    /duplicated/i,
  );
});

test('rejects invalid contributions and options', () => {
  for (const contributions of [null, undefined, {}, 'evidence']) {
    assert.throws(() => buildEvidenceDiagram(contributions as never), /contributions/i);
  }
  for (const weightDecibans of [Number.NaN, Number.POSITIVE_INFINITY, '12']) {
    assert.throws(
      () => buildEvidenceDiagram([{ id: 1, weightDecibans }] as never),
      /weightDecibans|finite/i,
    );
  }
  for (const options of [
    null,
    { minPriorDecibans: 1, maxPriorDecibans: -1 },
    { saturationThresholdDecibans: 0 },
    { anchors: { green: '#fff' } },
  ]) {
    assert.throws(() => buildEvidenceDiagram([], options as never), /prior|options|threshold|green/i);
  }
});

const _typeContribution: EvidenceContribution = { id: 'type', weightDecibans: 1 };
void _typeContribution;
