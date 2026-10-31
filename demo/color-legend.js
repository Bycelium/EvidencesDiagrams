function projectionGeometry(options) {
  const minimum = options?.minPriorDecibans;
  const maximum = options?.maxPriorDecibans;
  const threshold = options?.saturationThresholdDecibans;
  if (!Number.isFinite(minimum) || !Number.isFinite(maximum) || minimum > maximum) {
    throw new RangeError('Legend priors must be finite and ordered.');
  }
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError('The legend saturation threshold must be finite and positive.');
  }

  const priorHalfWidth = maximum / 2 - minimum / 2;
  const topHalfWidth = priorHalfWidth < threshold
    ? (priorHalfWidth / threshold) / (1 + priorHalfWidth / threshold)
    : 1 / (1 + threshold / priorHalfWidth);
  return { priorHalfWidth, threshold, topHalfWidth };
}

function clamp(value) {
  return Math.max(-1, Math.min(1, value));
}

/** Maps the library's triangular color coordinates onto the widening legend. */
export function createLegendProjection(options) {
  const { priorHalfWidth, threshold, topHalfWidth } = projectionGeometry(options);

  function directionalSaturation(orientation) {
    if (orientation === 1) return 1;
    const radius = priorHalfWidth + threshold;
    const saturation = Number.isFinite(radius)
      ? (orientation * radius - priorHalfWidth) / threshold
      : orientation - (1 - orientation) * priorHalfWidth / threshold;
    const tolerance = 8 * Number.EPSILON * Math.max(1, priorHalfWidth / threshold);
    return saturation <= tolerance ? 0 : Math.min(saturation, 1);
  }

  return {
    topHalfWidth,

    halfWidthAt(height) {
      return topHalfWidth + (1 - topHalfWidth) * height;
    },

    colorPosition({ x, height }) {
      const yellowWeight = Math.min(
        height,
        Math.max(0, topHalfWidth + (1 - topHalfWidth) * height - Math.abs(x)),
      );
      return { x, height: yellowWeight };
    },

    legendPosition({ x, height }) {
      const orientation = height === 1 ? 0 : Math.abs(clamp(x / (1 - height)));
      const saturation = directionalSaturation(orientation);
      return { x, height: height + (1 - height) * saturation };
    },
  };
}
