const TOLERANCE_FACTOR = 8;

function tolerance(...values) {
  return TOLERANCE_FACTOR * Number.EPSILON * Math.max(
    1,
    ...values.map((value) => Math.abs(value)),
  );
}

function clampAlmost(value, minimum, maximum) {
  if (value < minimum && minimum - value <= tolerance(value, minimum)) return minimum;
  if (value > maximum && value - maximum <= tolerance(value, maximum)) return maximum;
  return Math.min(maximum, Math.max(minimum, value));
}

function assertFiniteNumber(value, name) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${name} must be a finite number.`);
  }
}

function sideOutsideBounds(weight, minimum, maximum) {
  if (weight < minimum - tolerance(weight, minimum)) return 'left';
  if (weight > maximum + tolerance(weight, maximum)) return 'right';
  return null;
}

function visibleInterval(step, minimum, maximum, offset = 0) {
  const { weightDecibans } = step;
  if (weightDecibans === 0) {
    return sideOutsideBounds(step.start.weight + offset, minimum, maximum) === null
      ? { tStart: 0, tEnd: 0 }
      : null;
  }

  const startWeight = step.start.weight + offset;
  const tMinimum = (minimum - startWeight) / weightDecibans;
  const tMaximum = (maximum - startWeight) / weightDecibans;
  const entry = Math.min(tMinimum, tMaximum);
  const exit = Math.max(tMinimum, tMaximum);
  const margin = tolerance(entry, exit);

  if (exit < -margin || entry > 1 + margin) return null;

  const tStart = clampAlmost(Math.max(0, entry), 0, 1);
  const tEnd = clampAlmost(Math.min(1, exit), 0, 1);
  if (tStart > tEnd + tolerance(tStart, tEnd)) return null;
  return { tStart, tEnd: Math.max(tStart, tEnd) };
}

function stepPoint(step, t) {
  return {
    weight: step.start.weight + step.weightDecibans * t,
    absolute: step.start.absolute + Math.abs(step.weightDecibans) * t,
  };
}

function mergeIntervals(intervals) {
  if (intervals.length === 0) return [];
  const sorted = [...intervals].sort((a, b) => a.start - b.start || a.end - b.end);
  const merged = [{ ...sorted[0] }];

  for (const interval of sorted.slice(1)) {
    const previous = merged.at(-1);
    if (interval.start <= previous.end + tolerance(interval.start, previous.end)) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

function createOffscreenIntervals(visibleIntervals, totalAbsolute) {
  const offscreen = [];
  let cursor = 0;
  for (const visible of visibleIntervals) {
    if (visible.start > cursor + tolerance(visible.start, cursor)) {
      offscreen.push({ startAbsolute: cursor, endAbsolute: visible.start });
    }
    cursor = Math.max(cursor, visible.end);
  }
  if (totalAbsolute > cursor + tolerance(totalAbsolute, cursor)) {
    offscreen.push({ startAbsolute: cursor, endAbsolute: totalAbsolute });
  }
  return offscreen;
}

function weightAt(steps, absolute, totalWeight) {
  for (const step of steps) {
    const length = step.end.absolute - step.start.absolute;
    if (length <= 0) continue;
    if (absolute <= step.end.absolute + tolerance(absolute, step.end.absolute)) {
      const t = clampAlmost((absolute - step.start.absolute) / length, 0, 1);
      return step.start.weight + step.weightDecibans * t;
    }
  }
  return totalWeight;
}

function distanceFromOldest(absolute, breaks, verticalPixelsPerDeciban, breakHeight) {
  let distance = 0;
  let cursor = 0;
  for (const breakItem of breaks) {
    if (absolute <= breakItem.startAbsolute) {
      return distance + (absolute - cursor) * verticalPixelsPerDeciban;
    }
    distance += (breakItem.startAbsolute - cursor) * verticalPixelsPerDeciban;
    if (absolute <= breakItem.endAbsolute) {
      const proportion = (absolute - breakItem.startAbsolute) / breakItem.absoluteGap;
      return distance + proportion * breakHeight;
    }
    distance += breakHeight;
    cursor = breakItem.endAbsolute;
  }
  return distance + (absolute - cursor) * verticalPixelsPerDeciban;
}

function createSections(breaks, totalAbsolute, mapAbsolute) {
  const sections = [];
  let cursor = 0;
  for (const breakItem of breaks) {
    if (breakItem.startAbsolute > cursor + tolerance(breakItem.startAbsolute, cursor)) {
      sections.push({
        startAbsolute: cursor,
        endAbsolute: breakItem.startAbsolute,
        yStart: mapAbsolute(cursor),
        yEnd: mapAbsolute(breakItem.startAbsolute),
      });
    }
    cursor = breakItem.endAbsolute;
  }
  if (totalAbsolute > cursor + tolerance(totalAbsolute, cursor)) {
    sections.push({
      startAbsolute: cursor,
      endAbsolute: totalAbsolute,
      yStart: mapAbsolute(cursor),
      yEnd: mapAbsolute(totalAbsolute),
    });
  } else if (breaks.length === 0 && totalAbsolute === 0) {
    sections.push({ startAbsolute: 0, endAbsolute: 0, yStart: 0, yEnd: 0 });
  }
  return sections;
}

export function buildGeometry(diagram, options) {
  const {
    horizontalPixelsPerDeciban,
    verticalPixelsPerDeciban,
    breakHeight = 32,
    minPriorDecibans,
    maxPriorDecibans,
  } = options ?? {};
  if (diagram === null || typeof diagram !== 'object') {
    throw new TypeError('A valid evidence diagram is required.');
  }
  if (!Array.isArray(diagram.steps)) {
    throw new TypeError('The diagram must contain a steps array.');
  }

  const minimum = diagram.domain?.minimumDecibans;
  const maximum = diagram.domain?.maximumDecibans;
  const totalWeight = diagram.summary?.netWeightDecibans;
  const totalAbsolute = diagram.summary?.absoluteWeightDecibans;
  assertFiniteNumber(minimum, 'minimum');
  assertFiniteNumber(maximum, 'maximum');
  assertFiniteNumber(totalWeight, 'netWeightDecibans');
  assertFiniteNumber(totalAbsolute, 'absoluteWeightDecibans');
  assertFiniteNumber(minPriorDecibans, 'minPriorDecibans');
  assertFiniteNumber(maxPriorDecibans, 'maxPriorDecibans');
  assertFiniteNumber(horizontalPixelsPerDeciban, 'horizontalPixelsPerDeciban');
  assertFiniteNumber(verticalPixelsPerDeciban, 'verticalPixelsPerDeciban');
  assertFiniteNumber(breakHeight, 'breakHeight');
  if (minimum >= maximum) throw new RangeError('minimum must be strictly less than maximum.');
  if (minPriorDecibans > maxPriorDecibans) {
    throw new RangeError('minPriorDecibans must be less than or equal to maxPriorDecibans.');
  }
  if (totalAbsolute < 0) throw new RangeError('absoluteWeightDecibans must be non-negative.');
  if (horizontalPixelsPerDeciban <= 0) throw new RangeError('horizontalPixelsPerDeciban must be strictly positive.');
  if (verticalPixelsPerDeciban <= 0) throw new RangeError('verticalPixelsPerDeciban must be strictly positive.');
  if (breakHeight <= 0) throw new RangeError('breakHeight must be strictly positive.');

  const steps = diagram.steps.map((step) => {
    const weightDecibans = step?.weightDecibans;
    const startWeight = step?.start?.netWeightDecibans;
    const startAbsolute = step?.start?.absoluteWeightDecibans;
    const endWeight = step?.end?.netWeightDecibans;
    const endAbsolute = step?.end?.absoluteWeightDecibans;
    assertFiniteNumber(weightDecibans, 'weightDecibans');
    assertFiniteNumber(startWeight, 'start.netWeightDecibans');
    assertFiniteNumber(startAbsolute, 'start.absoluteWeightDecibans');
    assertFiniteNumber(endWeight, 'end.netWeightDecibans');
    assertFiniteNumber(endAbsolute, 'end.absoluteWeightDecibans');
    if (startAbsolute < 0 || endAbsolute < startAbsolute) {
      throw new RangeError('Step absolute weights must be non-negative and increasing.');
    }
    return {
      id: step.id,
      weightDecibans,
      start: { weight: startWeight, absolute: startAbsolute },
      end: { weight: endWeight, absolute: endAbsolute },
      visibleRibbon: null,
      edgeSegments: [],
    };
  });

  const rawVisibleMinimum = minimum - maxPriorDecibans;
  const rawVisibleMaximum = maximum - minPriorDecibans;
  const visibleIntervals = [];
  const clips = [];
  for (const step of steps) {
    const clip = visibleInterval(step, rawVisibleMinimum, rawVisibleMaximum);
    clips.push(clip);
    if (clip === null || step.weightDecibans === 0) continue;
    const start = stepPoint(step, clip.tStart).absolute;
    const end = stepPoint(step, clip.tEnd).absolute;
    if (end > start + tolerance(start, end)) visibleIntervals.push({ start, end });
  }

  const mergedVisible = mergeIntervals(visibleIntervals);
  const rawBreaks = createOffscreenIntervals(mergedVisible, totalAbsolute)
    .map((breakItem) => {
      const middle = breakItem.startAbsolute
        + (breakItem.endAbsolute - breakItem.startAbsolute) / 2;
      const middleWeight = weightAt(steps, middle, totalWeight);
      return {
        ...breakItem,
        absoluteGap: breakItem.endAbsolute - breakItem.startAbsolute,
        side: middleWeight < rawVisibleMinimum ? 'left' : 'right',
        hiddenEvidenceIds: [],
      };
    });

  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const length = step.end.absolute - step.start.absolute;
    if (step.weightDecibans === 0) {
      const side = sideOutsideBounds(
        step.start.weight,
        rawVisibleMinimum,
        rawVisibleMaximum,
      );
      if (side === null) continue;
      const breakItem = rawBreaks.find(({ startAbsolute, endAbsolute, side: breakSide }) => (
        breakSide === side
        && step.start.absolute >= startAbsolute
          - tolerance(step.start.absolute, startAbsolute)
        && step.start.absolute <= endAbsolute
          + tolerance(step.start.absolute, endAbsolute)
      ));
      if (breakItem) breakItem.hiddenEvidenceIds.push(step.id);
      continue;
    }
    if (length <= 0) continue;
    const clip = clips[index];
    const visibleLength = clip === null
      ? 0
      : length * Math.max(0, clip.tEnd - clip.tStart);
    if (visibleLength > tolerance(length, visibleLength)) continue;

    const middle = step.start.absolute + length / 2;
    const breakItem = rawBreaks.find(({ startAbsolute, endAbsolute }) => (
      middle > startAbsolute - tolerance(middle, startAbsolute)
      && middle < endAbsolute + tolerance(middle, endAbsolute)
    ));
    if (breakItem) breakItem.hiddenEvidenceIds.push(step.id);
  }

  const totalDistance = distanceFromOldest(
    totalAbsolute,
    rawBreaks,
    verticalPixelsPerDeciban,
    breakHeight,
  );
  if (!Number.isFinite(totalDistance)) {
    throw new RangeError('The calculated height must remain finite.');
  }
  const mapAbsolute = (absolute) => distanceFromOldest(
    absolute,
    rawBreaks,
    verticalPixelsPerDeciban,
    breakHeight,
  );

  const breaks = rawBreaks.map((breakItem) => ({
    side: breakItem.side,
    y: mapAbsolute(breakItem.startAbsolute),
    height: breakHeight,
    startAbsolute: breakItem.startAbsolute,
    endAbsolute: breakItem.endAbsolute,
    absoluteGap: breakItem.absoluteGap,
    hiddenEvidenceIds: breakItem.hiddenEvidenceIds,
  }));

  const edges = minPriorDecibans === maxPriorDecibans
    ? [{ prior: minPriorDecibans, side: 'exact' }]
    : [
      { prior: minPriorDecibans, side: 'minimum' },
      { prior: maxPriorDecibans, side: 'maximum' },
    ];
  for (let index = 0; index < steps.length; index += 1) {
    const step = steps[index];
    const ribbonClip = clips[index];
    if (ribbonClip !== null && (
      step.weightDecibans === 0
      || ribbonClip.tEnd - ribbonClip.tStart > tolerance(ribbonClip.tStart, ribbonClip.tEnd)
    )) {
      const start = stepPoint(step, ribbonClip.tStart);
      const end = stepPoint(step, ribbonClip.tEnd);
      step.visibleRibbon = {
        startAbsolute: start.absolute,
        endAbsolute: end.absolute,
        y1: mapAbsolute(start.absolute),
        y2: mapAbsolute(end.absolute),
        startWeight: start.weight,
        endWeight: end.weight,
        xMinimum1: (start.weight + minPriorDecibans - minimum) * horizontalPixelsPerDeciban,
        xMaximum1: (start.weight + maxPriorDecibans - minimum) * horizontalPixelsPerDeciban,
        xMinimum2: (end.weight + minPriorDecibans - minimum) * horizontalPixelsPerDeciban,
        xMaximum2: (end.weight + maxPriorDecibans - minimum) * horizontalPixelsPerDeciban,
      };
    }

    for (const { prior, side } of edges) {
      const edgeClip = visibleInterval(step, minimum, maximum, prior);
      if (edgeClip === null || (
        step.weightDecibans !== 0
        && edgeClip.tEnd - edgeClip.tStart <= tolerance(edgeClip.tStart, edgeClip.tEnd)
      )) continue;
      const start = stepPoint(step, edgeClip.tStart);
      const end = stepPoint(step, edgeClip.tEnd);
      step.edgeSegments.push({
        side,
        x1: (start.weight + prior - minimum) * horizontalPixelsPerDeciban,
        y1: mapAbsolute(start.absolute),
        x2: (end.weight + prior - minimum) * horizontalPixelsPerDeciban,
        y2: mapAbsolute(end.absolute),
        trueEnd: Math.abs(edgeClip.tEnd - 1) <= tolerance(edgeClip.tEnd, 1),
      });
    }
  }

  const intervalMinimum = totalWeight + minPriorDecibans;
  const intervalMaximum = totalWeight + maxPriorDecibans;
  const currentVisible = intervalMaximum >= minimum - tolerance(intervalMaximum, minimum)
    && intervalMinimum <= maximum + tolerance(intervalMinimum, maximum);
  let activeEndpoint = null;
  if (totalWeight !== 0) {
    const side = totalWeight > 0 ? 'minimum' : 'maximum';
    const weight = totalWeight + (totalWeight > 0 ? minPriorDecibans : maxPriorDecibans);
    activeEndpoint = {
      side,
      visible: sideOutsideBounds(weight, minimum, maximum) === null,
    };
  }
  return {
    minimum,
    maximum,
    horizontalPixelsPerDeciban,
    verticalPixelsPerDeciban,
    totalWeight,
    totalAbsolute,
    minPriorDecibans,
    maxPriorDecibans,
    currentInterval: {
      minimum: intervalMinimum,
      maximum: intervalMaximum,
      visible: currentVisible,
    },
    activeEndpoint,
    steps,
    breaks,
    sections: createSections(rawBreaks, totalAbsolute, mapAbsolute),
    totalHeight: totalDistance,
  };
}

function assertGeometryValue(geometry, value, name, maximum) {
  if (geometry === null || typeof geometry !== 'object') {
    throw new TypeError('A valid geometry is required.');
  }
  assertFiniteNumber(value, name);
  const margin = tolerance(value, maximum);
  if (value < -margin || value > maximum + margin) {
    throw new RangeError(`${name} is outside the geometry.`);
  }
  return clampAlmost(value, 0, maximum);
}

export function positionAbsolute(geometry, absolute) {
  const value = assertGeometryValue(geometry, absolute, 'absolute', geometry?.totalAbsolute);
  for (const breakItem of geometry.breaks) {
    if (
      value >= breakItem.startAbsolute - tolerance(value, breakItem.startAbsolute)
      && value <= breakItem.endAbsolute + tolerance(value, breakItem.endAbsolute)
    ) {
      const proportion = (value - breakItem.startAbsolute) / breakItem.absoluteGap;
      return breakItem.y + clampAlmost(proportion, 0, 1) * breakItem.height;
    }
  }
  const section = geometry.sections.find(({ startAbsolute, endAbsolute }) => (
    value >= startAbsolute - tolerance(value, startAbsolute)
    && value <= endAbsolute + tolerance(value, endAbsolute)
  ));
  if (section) {
    return section.yStart + (value - section.startAbsolute) * geometry.verticalPixelsPerDeciban;
  }
  return value === geometry.totalAbsolute ? geometry.totalHeight : 0;
}

export function absoluteFromY(geometry, y) {
  const value = assertGeometryValue(geometry, y, 'y', geometry?.totalHeight);
  for (const breakItem of geometry.breaks) {
    const bottom = breakItem.y + breakItem.height;
    if (
      value > breakItem.y + tolerance(value, breakItem.y)
      && value < bottom - tolerance(value, bottom)
    ) return null;
    if (Math.abs(value - breakItem.y) <= tolerance(value, breakItem.y)) {
      return breakItem.startAbsolute;
    }
    if (Math.abs(value - bottom) <= tolerance(value, bottom)) {
      return breakItem.endAbsolute;
    }
  }
  const section = geometry.sections.find(({ yStart, yEnd }) => (
    value >= yStart - tolerance(value, yStart)
    && value <= yEnd + tolerance(value, yEnd)
  ));
  if (section) {
    return clampAlmost(
      section.startAbsolute + (value - section.yStart) / geometry.verticalPixelsPerDeciban,
      section.startAbsolute,
      section.endAbsolute,
    );
  }
  return value === 0 ? 0 : geometry.totalAbsolute;
}
