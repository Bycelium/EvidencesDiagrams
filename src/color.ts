import { DEFAULT_PRIORS, validatePriors } from './priors.js';
import type { ColorOptions, EvidenceSummary, TrianglePosition } from './types.js';

export const DEFAULT_COLOR_OPTIONS = Object.freeze({
  ...DEFAULT_PRIORS,
  saturationThresholdDecibans: 30,
  anchors: Object.freeze({
    gray: '#9ca3af',
    yellow: '#eab308',
    green: '#22c55e',
    red: '#ef4444',
  }),
});

type AnchorName = keyof typeof DEFAULT_COLOR_OPTIONS.anchors;
type Rgb = readonly [number, number, number];

/** Projects a summary into the triangle: red at −1, green at +1, and yellow at the top. */
export function trianglePosition(
  summary: EvidenceSummary,
  options: ColorOptions = {},
): TrianglePosition {
  const {
    midpoint,
    halfWidth,
    threshold,
    min,
    max,
  } = colorGeometry(options);
  const netWeight = summary?.netWeightDecibans;
  const absoluteWeight = summary?.absoluteWeightDecibans;
  const dissonance = summary?.dissonance;
  if (typeof netWeight !== 'number' || Number.isNaN(netWeight)
      || typeof absoluteWeight !== 'number' || Number.isNaN(absoluteWeight)
      || absoluteWeight < Math.abs(netWeight)
      || !Number.isFinite(dissonance) || dissonance < 0 || dissonance > 1) {
    throw new RangeError('The summary must contain valid weights and dissonance.');
  }
  const height = Math.min(absoluteWeight / threshold, 1) * dissonance;
  let orientation = normalizedOrientation(netWeight, midpoint, halfWidth, threshold);
  // A radius rounded to its half-width can conflate the gray boundary with a vertex.
  if (Math.abs(orientation) === 1 && netWeight + min <= 0 && netWeight + max >= 0) {
    orientation *= 1 - Number.EPSILON;
  }
  return { x: (1 - height) * orientation, height };
}

/** Produces the CSS color for a summary from its position in the triangle. */
export function color(summary: EvidenceSummary, options: ColorOptions = {}): string {
  return triangleColor(trianglePosition(summary, options), options);
}

/** Colors a normalized triangle position using the same priors as the summary. */
export function triangleColor(
  position: TrianglePosition,
  options: ColorOptions = {},
): string {
  const { halfWidth, threshold } = colorGeometry(options);
  const x = position?.x;
  const y = position?.height;
  if (!Number.isFinite(x) || !Number.isFinite(y)
      || y < 0 || y > 1 || Math.abs(x) > 1 - y + 8 * Number.EPSILON) {
    throw new RangeError('The position must lie within the normalized triangle.');
  }

  const customAnchors = options?.anchors ?? {};
  const gray = parseAnchor('gray', customAnchors.gray);
  const yellow = parseAnchor('yellow', customAnchors.yellow);
  const green = parseAnchor('green', customAnchors.green);
  const red = parseAnchor('red', customAnchors.red);

  const orientation = y === 1 ? 0 : clamp(x / (1 - y));
  const saturation = directionalSaturation(Math.abs(orientation), halfWidth, threshold);
  const grayWeight = (1 - y) * (1 - saturation);
  const yellowWeight = y;
  const agreementWeight = (1 - y) * saturation;
  const agreementAnchor = orientation < 0 ? red : green;

  const channels = gray.map((channel, index) => Math.round(
    channel * grayWeight
      + yellow[index] * yellowWeight
      + agreementAnchor[index] * agreementWeight,
  ));

  return `#${channels.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
}

function colorGeometry(options: ColorOptions): {
  midpoint: number;
  halfWidth: number;
  threshold: number;
  min: number;
  max: number;
} {
  const { minPriorDecibans: min, maxPriorDecibans: max } = validatePriors(options);
  const threshold = options.saturationThresholdDecibans === undefined
    ? DEFAULT_COLOR_OPTIONS.saturationThresholdDecibans
    : options.saturationThresholdDecibans;
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError('The saturation threshold must be a finite positive number.');
  }
  return {
    midpoint: min / 2 + max / 2,
    halfWidth: max / 2 - min / 2,
    threshold,
    min,
    max,
  };
}

function normalizedOrientation(
  weight: number,
  midpoint: number,
  width: number,
  threshold: number,
): number {
  if (!Number.isFinite(weight)) return Math.sign(weight);
  const center = weight + midpoint;
  const radius = width + threshold;
  if (Number.isFinite(center) && Number.isFinite(radius)) return clamp(center / radius);

  // A common scale prevents the center sum and radius from overflowing.
  const scale = Math.max(Math.abs(weight), Math.abs(midpoint), width, threshold);
  const numerator = Number.isFinite(center)
    ? center / scale
    : weight / scale + midpoint / scale;
  return clamp(numerator / (width / scale + threshold / scale));
}

function directionalSaturation(orientation: number, width: number, threshold: number): number {
  if (orientation === 1) return 1;
  const radius = width + threshold;
  const saturation = Number.isFinite(radius)
    ? (orientation * radius - width) / threshold
    : orientation - (1 - orientation) * width / threshold;
  // Rounding at the boundary preserves the gray shade.
  const tolerance = 8 * Number.EPSILON * Math.max(1, width / threshold);
  return saturation <= tolerance ? 0 : Math.min(saturation, 1);
}

function clamp(value: number): number {
  return Math.max(-1, Math.min(value, 1));
}

function parseAnchor(name: AnchorName, value?: string): Rgb {
  const hex = value ?? DEFAULT_COLOR_OPTIONS.anchors[name];
  if (typeof hex !== 'string' || !/^#[0-9a-f]{6}$/iu.test(hex)) {
    throw new RangeError(`The ${name} anchor must be a #RRGGBB hexadecimal CSS color.`);
  }
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16),
  ];
}
