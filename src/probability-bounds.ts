import { decibansToProbability } from './conversions.js';
import { validatePriors } from './priors.js';
import type { EvidenceSummary, ProbabilityBoundsOptions } from './types.js';
export type { ProbabilityBoundsOptions } from './types.js';

export type ProbabilityBound =
  | {
    readonly direction: 'lower' | 'upper' | 'exact';
    readonly probability: number;
    readonly displayPercentage: number;
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
    const displayPercentage = Math.round(probability * 100);
    return {
      direction: 'exact',
      probability,
      displayPercentage,
      text: `Probability = ${displayPercentage} %`,
    };
  }

  if (netWeightDecibans > 0) {
    const probability = probabilityFor(netWeightDecibans, minPriorDecibans);
    const displayPercentage = lowerDisplayPercentage(
      probability,
      netWeightDecibans,
      minPriorDecibans,
    );
    return {
      direction: 'lower',
      probability,
      displayPercentage,
      text: `Probability ≥ ${displayPercentage} %`,
    };
  }

  if (netWeightDecibans < 0) {
    const probability = probabilityFor(netWeightDecibans, maxPriorDecibans);
    const displayPercentage = upperDisplayPercentage(
      probability,
      netWeightDecibans,
      maxPriorDecibans,
    );
    return {
      direction: 'upper',
      probability,
      displayPercentage,
      text: `Probability ≤ ${displayPercentage} %`,
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

function probabilityFor(netWeightDecibans: number, priorDecibans: number): number {
  return decibansToProbability({
    weightDecibans: netWeightDecibans + priorDecibans,
  }).probability;
}

function lowerDisplayPercentage(probability: number, weight: number, prior: number): number {
  const percentage = Math.floor(probability * 100);
  return Number.isFinite(weight) && Number.isFinite(prior)
    ? Math.min(percentage, 99)
    : percentage;
}

function upperDisplayPercentage(probability: number, weight: number, prior: number): number {
  const percentage = Math.ceil(probability * 100);
  return Number.isFinite(weight) && Number.isFinite(prior)
    ? Math.max(percentage, 1)
    : percentage;
}
