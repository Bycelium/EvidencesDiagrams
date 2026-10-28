import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEvidenceDiagram } from '../dist/index.js';
import {
  absoluteFromY,
  buildGeometry,
  positionAbsolute,
} from './geometry.js';

const closeTo = (received, expected, margin = 1e-10) => {
  assert.ok(Math.abs(received - expected) <= margin, `${received} ≉ ${expected}`);
};

const deepFreeze = (value) => {
  if (value === null || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
};

const geometry = (weights, options = {}) => {
  const {
    minimum = -45,
    maximum = 45,
    pixelsPerDeciban = 2,
    breakHeight = 32,
    minPriorDecibans = 0,
    maxPriorDecibans = 0,
  } = options;
  const publicDiagram = deepFreeze(buildEvidenceDiagram(
    weights.map((weightDecibans, index) => ({ id: `p${index + 1}`, weightDecibans })),
  ));
  const diagram = Object.freeze({
    ...publicDiagram,
    domain: Object.freeze({
      minimumDecibans: minimum,
      maximumDecibans: maximum,
    }),
  });
  return buildGeometry(diagram, {
    pixelsPerDeciban,
    breakHeight,
    minPriorDecibans,
    maxPriorDecibans,
  });
};

test('an excursion hides only fully offscreen evidence', () => {
  const result = geometry([30, 30, 12, -30, -30]);
  assert.equal(result.breaks.length, 1);
  assert.deepEqual(result.breaks[0], {
    side: 'right',
    y: 66,
    height: 32,
    startAbsolute: 45,
    endAbsolute: 99,
    absoluteGap: 54,
    hiddenEvidenceIds: ['p3'],
  });
  assert.equal(result.totalHeight, 188);
  assert.equal(result.steps[1].visibleRibbon.endAbsolute, 45);
  assert.equal(result.steps[3].visibleRibbon.startAbsolute, 99);
});

test('exit and re-entry fragments do not count as hidden evidence', () => {
  const result = geometry([60, -30]);
  assert.equal(result.breaks.length, 1);
  assert.equal(result.breaks[0].absoluteGap, 30);
  assert.deepEqual(result.breaks[0].hiddenEvidenceIds, []);
  assert.equal(result.steps[0].visibleRibbon.endAbsolute, 45);
  assert.equal(result.steps[1].visibleRibbon.startAbsolute, 75);
  assert.equal(result.steps[0].edgeSegments[0].trueEnd, false);
  assert.equal(result.steps[1].edgeSegments[0].trueEnd, true);
});

test('evidence crossing both sides keeps its central fragment', () => {
  const result = geometry([60, -120]);
  const segment = result.steps[1].edgeSegments[0];
  assert.equal(result.breaks.length, 2);
  assert.deepEqual(result.breaks.map((breakItem) => breakItem.side), ['right', 'left']);
  assert.deepEqual(result.breaks.map((breakItem) => breakItem.hiddenEvidenceIds), [[], []]);
  closeTo(absoluteFromY(result, segment.y1), 75);
  closeTo(absoluteFromY(result, segment.y2), 165);
  closeTo(segment.x1, 180);
  closeTo(segment.x2, 0);
  closeTo(Math.abs(segment.x2 - segment.x1), Math.abs(segment.y2 - segment.y1));
});

test('touching a boundary does not create two breaks', () => {
  const result = geometry([45, 10, -10, -20]);
  assert.equal(result.breaks.length, 1);
  assert.equal(result.breaks[0].startAbsolute, 45);
  assert.equal(result.breaks[0].endAbsolute, 65);
  assert.deepEqual(result.breaks[0].hiddenEvidenceIds, ['p2', 'p3']);
  assert.equal(result.steps[0].visibleRibbon.endAbsolute, 45);
  assert.equal(result.steps[1].visibleRibbon, null);
  assert.equal(result.steps[2].visibleRibbon, null);
  assert.equal(result.steps[3].visibleRibbon.startAbsolute, 65);
});

test('ordinary evidence rises at 45 degrees and keeps its identifiers', () => {
  const result = geometry([12, -5], { pixelsPerDeciban: 3 });
  assert.equal(result.breaks.length, 0);
  assert.deepEqual(result.steps.map(({ id }) => id), ['p1', 'p2']);
  for (const step of result.steps) {
    assert.equal(step.edgeSegments.length, 1);
    const [segment] = step.edgeSegments;
    closeTo(Math.abs(segment.x2 - segment.x1), Math.abs(segment.y2 - segment.y1));
    assert.ok(segment.y2 < segment.y1);
  }
  assert.deepEqual(result.currentInterval, {
    minimum: 7,
    maximum: 7,
    visible: true,
  });
  assert.deepEqual(result.activeEndpoint, {
    side: 'minimum',
    visible: true,
  });
  assert.equal(result.totalHeight, 51);
});

test('zero-weight evidence produces a selectable point without a break', () => {
  const result = geometry([0], { minimum: 0, maximum: 90 });
  const ribbon = result.steps[0].visibleRibbon;
  assert.equal(result.totalHeight, 0);
  assert.equal(result.breaks.length, 0);
  assert.deepEqual(ribbon, {
    startAbsolute: 0,
    endAbsolute: 0,
    y1: 0,
    y2: 0,
    startWeight: 0,
    endWeight: 0,
    xMinimum1: 0,
    xMaximum1: 0,
    xMinimum2: 0,
    xMaximum2: 0,
  });
  assert.equal(result.currentInterval.visible, true);
  assert.equal(result.activeEndpoint, null);
  assert.equal(absoluteFromY(result, 0), 0);
});

test('zero-weight offscreen evidence joins its break without creating one', () => {
  const result = geometry([60, 0, -30]);
  assert.equal(result.breaks.length, 1);
  assert.equal(result.breaks[0].startAbsolute, 45);
  assert.equal(result.breaks[0].endAbsolute, 75);
  assert.deepEqual(result.breaks[0].hiddenEvidenceIds, ['p2']);
  assert.equal(result.steps[1].visibleRibbon, null);

  const zeroOnly = geometry([0], { minimum: -100, maximum: -10 });
  assert.equal(zeroOnly.breaks.length, 0);
  assert.equal(zeroOnly.steps[0].visibleRibbon, null);
});

test('an asymmetric viewport remains valid when zero and the current value are offscreen', () => {
  const empty = geometry([], { minimum: -100, maximum: -10 });
  assert.equal(empty.currentInterval.visible, false);
  assert.equal(empty.activeEndpoint, null);
  assert.equal(empty.totalHeight, 0);
  assert.equal(empty.breaks.length, 0);

  const boundary = geometry([0], { minimum: 0, maximum: 90 });
  assert.equal(boundary.currentInterval.visible, true);
});

test('open excursions at the edges become full bands', () => {
  const result = geometry([30, -80], { minimum: -10, maximum: 20 });
  assert.deepEqual(
    result.breaks.map(({ side, startAbsolute, endAbsolute }) => ({
      side,
      startAbsolute,
      endAbsolute,
    })),
    [
      { side: 'right', startAbsolute: 20, endAbsolute: 40 },
      { side: 'left', startAbsolute: 70, endAbsolute: 110 },
    ],
  );
  assert.equal(result.breaks[1].y, 0);
  assert.deepEqual(result.activeEndpoint, {
    side: 'maximum',
    visible: false,
  });
});

test('absolute conversions are linear outside breaks and null within them', () => {
  const result = geometry([30, 30, 12, -30, -30]);
  const breakItem = result.breaks[0];
  for (const absolute of [0, 12.5, 45, 99, 110, 132]) {
    const y = positionAbsolute(result, absolute);
    closeTo(absoluteFromY(result, y), absolute);
  }
  assert.equal(absoluteFromY(result, breakItem.y + breakItem.height / 2), null);
  assert.equal(positionAbsolute(result, 72), breakItem.y + breakItem.height / 2);
  for (const section of result.sections) {
    closeTo(
      section.yStart - section.yEnd,
      (section.endAbsolute - section.startAbsolute) * result.pixelsPerDeciban,
    );
  }
});

test('many alternating evidence items remain one long linear section', () => {
  const weights = Array.from({ length: 2_000 }, (_, index) => (index % 2 === 0 ? 1 : -1));
  const result = geometry(weights, { minimum: -2, maximum: 2, pixelsPerDeciban: 0.5 });
  assert.equal(result.breaks.length, 0);
  assert.equal(result.sections.length, 1);
  assert.equal(result.totalAbsolute, 2_000);
  assert.equal(result.totalHeight, 1_000);
  closeTo(absoluteFromY(result, 250), 1_500);
});

test('both ribbon edges share the same vertical projection', () => {
  const result = geometry([12, -5], {
    minimum: -45,
    maximum: 45,
    pixelsPerDeciban: 3,
    minPriorDecibans: -10,
    maxPriorDecibans: 20,
  });

  for (const step of result.steps) {
    assert.equal(step.edgeSegments.length, 2);
    const [minimum, maximum] = step.edgeSegments;
    assert.equal(minimum.y1, maximum.y1);
    assert.equal(minimum.y2, maximum.y2);
    closeTo(minimum.x2 - minimum.x1, maximum.x2 - maximum.x1);
    closeTo(Math.abs(minimum.x2 - minimum.x1), Math.abs(minimum.y2 - minimum.y1));
    assert.equal(step.visibleRibbon.y1, minimum.y1);
    assert.equal(step.visibleRibbon.y2, minimum.y2);
  }

  const partial = geometry([60], {
    minPriorDecibans: -20,
    maxPriorDecibans: 20,
  });
  const [edgeMinimum, edgeMaximum] = partial.steps[0].edgeSegments;
  const endAbsoluteMaximum = absoluteFromY(partial, edgeMaximum.y2);
  const endAbsoluteMinimum = absoluteFromY(partial, edgeMinimum.y2);
  assert.equal(endAbsoluteMaximum, 25);
  const proportion = endAbsoluteMaximum / endAbsoluteMinimum;
  closeTo(
    edgeMinimum.y1 + (edgeMinimum.y2 - edgeMinimum.y1) * proportion,
    edgeMaximum.y2,
  );
});

test('a ribbon crossing the viewport remains visible with both edges offscreen', () => {
  const result = geometry([10], {
    minPriorDecibans: -100,
    maxPriorDecibans: 100,
  });

  assert.equal(result.breaks.length, 0);
  assert.ok(result.steps[0].visibleRibbon);
  assert.deepEqual(result.steps[0].edgeSegments, []);
  assert.equal(result.currentInterval.visible, true);
  assert.equal(result.steps[0].visibleRibbon.xMinimum2 < 0, true);
  assert.equal(result.steps[0].visibleRibbon.xMaximum2 > 180, true);
});

test('an excursion compacts only the section where the full ribbon is hidden', () => {
  const result = geometry([70, 10, -30], {
    minPriorDecibans: -10,
    maxPriorDecibans: 10,
  });

  assert.equal(result.breaks.length, 1);
  assert.deepEqual(result.breaks[0], {
    side: 'right',
    y: 10,
    height: 32,
    startAbsolute: 55,
    endAbsolute: 105,
    absoluteGap: 50,
    hiddenEvidenceIds: ['p2'],
  });
  assert.equal(result.steps[0].visibleRibbon.endAbsolute, 55);
  assert.equal(result.steps[1].visibleRibbon, null);
  assert.equal(result.steps[2].visibleRibbon.startAbsolute, 105);
});

test('asymmetric priors move the interval and active endpoint', () => {
  const result = geometry([12], {
    minimum: -50,
    maximum: 50,
    minPriorDecibans: -20,
    maxPriorDecibans: 5,
  });

  assert.deepEqual(result.currentInterval, {
    minimum: -8,
    maximum: 17,
    visible: true,
  });
  assert.deepEqual(result.activeEndpoint, {
    side: 'minimum',
    visible: true,
  });
  const negative = geometry([-12], {
    minimum: -50,
    maximum: 50,
    minPriorDecibans: -20,
    maxPriorDecibans: 5,
  });
  assert.equal(negative.activeEndpoint.side, 'maximum');
  assert.equal(negative.activeEndpoint.visible, true);
});

test('non-finite inputs and degenerate options are rejected', () => {
  const rawDiagram = buildEvidenceDiagram([{ id: 'p1', weightDecibans: 1 }]);
  const diagram = {
    ...rawDiagram,
    domain: { minimumDecibans: -45, maximumDecibans: 45 },
  };
  const degenerateDomain = {
    ...diagram,
    domain: { minimumDecibans: 1, maximumDecibans: 1 },
  };
  const invalidSummary = {
    ...diagram,
    summary: { ...diagram.summary, netWeightDecibans: Number.POSITIVE_INFINITY },
  };
  const options = {
    pixelsPerDeciban: 2,
    minPriorDecibans: 0,
    maxPriorDecibans: 0,
  };
  assert.throws(
    () => buildGeometry(invalidSummary, options),
    /finite/,
  );
  assert.throws(
    () => buildGeometry(degenerateDomain, options),
    /minimum/,
  );
  assert.throws(
    () => buildGeometry(diagram, { ...options, pixelsPerDeciban: 0 }),
    /positive/,
  );
  assert.throws(
    () => buildGeometry(diagram, {
      pixelsPerDeciban: 2,
      breakHeight: Number.NaN,
      minPriorDecibans: 0,
      maxPriorDecibans: 0,
    }),
    /finite/,
  );
  assert.throws(
    () => buildGeometry(diagram, {
      ...options,
      minPriorDecibans: 1,
      maxPriorDecibans: -1,
    }),
    /minPriorDecibans/,
  );
});
