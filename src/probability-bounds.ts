import { decibansToProbability } from './conversions.js';
import { validatePriors } from './priors.js';
import type { EvidenceSummary, ProbabilityBoundsOptions } from './types.js';
export type { ProbabilityBoundsOptions } from './types.js';

export type ProbabilityBound =
  | {
    readonly direction: 'lower' | 'upper' | 'exact';
    readonly probability: number;
    readonly displayPercentage: number;
    /** Overrides the direction-derived comparator when finite precision reaches an endpoint. */
    readonly displayOperator?: '≥' | '≤' | '>' | '<';
    readonly text: string;
  }
  | {
    readonly direction: 'indeterminate';
    readonly reason: 'no-evidence' | 'dissonant-evidence';
    readonly text: 'No evidence' | 'Dissonant evidence';
  };

/**
 * Bounds probability using a prior interval expressed in decibans.
 * The direction of the evidence determines which bound remains guaranteed.
 */
export function boundProbability(
  summary: EvidenceSummary,
  options?: ProbabilityBoundsOptions,
): ProbabilityBound {
  const netWeightDecibans: unknown = summary?.netWeightDecibans;
  if (typeof netWeightDecibans !== 'number' || Number.isNaN(netWeightDecibans)) {
    throw new RangeError('The summary must contain a defined netWeightDecibans value.');
  }

  const { minPriorDecibans, maxPriorDecibans } = validatePriors(options);

  if (minPriorDecibans === maxPriorDecibans) {
    const probability = probabilityFor(netWeightDecibans, minPriorDecibans);
    const display = displayPercentage(
      probability,
      'exact',
      finiteInputs(netWeightDecibans, minPriorDecibans),
    );
    return {
      direction: 'exact',
      probability,
      displayPercentage: display.value,
      ...(display.operator === undefined ? {} : { displayOperator: display.operator }),
      text: `Probability ${display.operator ?? '='} ${formatPercentage(display.value)} %`,
    };
  }

  if (netWeightDecibans > 0) {
    const probability = probabilityFor(netWeightDecibans, minPriorDecibans);
    const display = displayPercentage(
      probability,
      'lower',
      finiteInputs(netWeightDecibans, minPriorDecibans),
    );
    return {
      direction: 'lower',
      probability,
      displayPercentage: display.value,
      ...(display.operator === undefined ? {} : { displayOperator: display.operator }),
      text: `Probability ${display.operator ?? '≥'} ${formatPercentage(display.value)} %`,
    };
  }

  if (netWeightDecibans < 0) {
    const probability = probabilityFor(netWeightDecibans, maxPriorDecibans);
    const display = displayPercentage(
      probability,
      'upper',
      finiteInputs(netWeightDecibans, maxPriorDecibans),
    );
    return {
      direction: 'upper',
      probability,
      displayPercentage: display.value,
      ...(display.operator === undefined ? {} : { displayOperator: display.operator }),
      text: `Probability ${display.operator ?? '≤'} ${formatPercentage(display.value)} %`,
    };
  }

  const absoluteWeightDecibans: unknown = summary?.absoluteWeightDecibans;
  if (typeof absoluteWeightDecibans !== 'number'
      || Number.isNaN(absoluteWeightDecibans)
      || absoluteWeightDecibans < 0) {
    throw new RangeError(
      'A zero-net-weight summary must contain a valid absoluteWeightDecibans value.',
    );
  }
  if (absoluteWeightDecibans === 0) {
    return {
      direction: 'indeterminate',
      reason: 'no-evidence',
      text: 'No evidence',
    };
  }
  return {
    direction: 'indeterminate',
    reason: 'dissonant-evidence',
    text: 'Dissonant evidence',
  };
}

const EXTREME_PERCENTAGE = 1;
const MAX_FRACTION_DIGITS = 12;

function probabilityFor(netWeightDecibans: number, priorDecibans: number): number {
  return decibansToProbability({
    weightDecibans: netWeightDecibans + priorDecibans,
  }).probability;
}

function finiteInputs(weight: number, prior: number): boolean {
  return Number.isFinite(weight) && Number.isFinite(prior);
}

/** Formats a single posterior endpoint for the bundled demo. */
export function formatProbabilityDisplay(
  weightDecibans: number,
  direction: 'lower' | 'upper' | 'exact',
): { value: number; operator?: '≥' | '≤' | '>' | '<' } {
  return displayPercentage(
    decibansToProbability({ weightDecibans }).probability,
    direction,
    Number.isFinite(weightDecibans),
  );
}

function displayPercentage(
  probability: number,
  direction: 'lower' | 'upper' | 'exact',
  hasFiniteInputs: boolean,
): { value: number; operator?: '≥' | '≤' | '>' | '<' } {
  const percentage = probability * 100;
  if (!hasFiniteInputs) return roundedPercentage(percentage, direction, 0);

  const distance = Math.min(percentage, 100 - percentage);
  const fractionDigits = distance < EXTREME_PERCENTAGE
    ? Math.max(1, Math.min(MAX_FRACTION_DIGITS, Math.ceil(-Math.log10(distance))))
    : 0;
  const display = roundedPercentage(percentage, direction, fractionDigits);
  if (display.value === 100) {
    const value = 100 - 10 ** -MAX_FRACTION_DIGITS;
    if (direction === 'upper') return { value: 100, operator: '<' };
    return direction === 'exact' ? { value, operator: '≥' } : { value };
  }
  if (display.value === 0) {
    const value = 10 ** -MAX_FRACTION_DIGITS;
    if (direction === 'lower') return { value: 0, operator: '>' };
    return direction === 'exact' ? { value, operator: '≤' } : { value };
  }
  return display;
}

function roundedPercentage(
  percentage: number,
  direction: 'lower' | 'upper' | 'exact',
  fractionDigits: number,
): { value: number } {
  const scale = 10 ** fractionDigits;
  let rounded = direction === 'lower'
    ? Math.floor(percentage * scale) / scale
    : direction === 'upper'
      ? Math.ceil(percentage * scale) / scale
      : Math.round(percentage * scale) / scale;
  const quantum = 1 / scale;
  if (direction === 'lower' && rounded > percentage) rounded -= quantum;
  if (direction === 'upper' && rounded < percentage) rounded += quantum;
  rounded = Number(rounded.toFixed(fractionDigits));
  if (direction === 'lower' && rounded > percentage) {
    rounded = Number((rounded - quantum).toFixed(fractionDigits));
  }
  if (direction === 'upper' && rounded < percentage) {
    rounded = Number((rounded + quantum).toFixed(fractionDigits));
  }
  return { value: rounded };
}

function formatPercentage(value: number): string {
  if (!(value > 0 && value < 10 ** -6)) return String(value);
  return value.toFixed(MAX_FRACTION_DIGITS).replace(/0+$/u, '').replace(/\.$/u, '');
}
