import type { ProbabilityBoundsOptions } from './types.js';

export const DEFAULT_PRIORS = Object.freeze({
  minPriorDecibans: -15,
  maxPriorDecibans: 15,
});

export function validatePriors(options?: ProbabilityBoundsOptions): {
  minPriorDecibans: number;
  maxPriorDecibans: number;
} {
  if (options !== undefined && (typeof options !== 'object' || options === null)) {
    throw new RangeError('Probability-bound options must be an object.');
  }
  const minPriorDecibans: unknown = options?.minPriorDecibans === undefined
    ? DEFAULT_PRIORS.minPriorDecibans
    : options.minPriorDecibans;
  const maxPriorDecibans: unknown = options?.maxPriorDecibans === undefined
    ? DEFAULT_PRIORS.maxPriorDecibans
    : options.maxPriorDecibans;
  if (typeof minPriorDecibans !== 'number'
      || typeof maxPriorDecibans !== 'number'
      || !Number.isFinite(minPriorDecibans)
      || !Number.isFinite(maxPriorDecibans)) {
    throw new RangeError('Priors must be finite numbers.');
  }
  if (minPriorDecibans > maxPriorDecibans) {
    throw new RangeError('The minimum prior cannot exceed the maximum prior.');
  }
  return { minPriorDecibans, maxPriorDecibans };
}
