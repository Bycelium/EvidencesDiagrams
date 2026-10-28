import type { EvidenceWeight, Probability } from './types.js';

/** Converts a probability into log-odds decibans. */
export function probabilityToDecibans(input: Probability): EvidenceWeight {
  const probability: unknown = input?.probability;
  if (typeof probability !== 'number'
      || !Number.isFinite(probability)
      || probability < 0
      || probability > 1) {
    throw new RangeError('Probability must be a finite number between 0 and 1.');
  }
  if (probability === 0) return { weightDecibans: Number.NEGATIVE_INFINITY };
  if (probability === 1) return { weightDecibans: Number.POSITIVE_INFINITY };
  return { weightDecibans: 10 * Math.log10(probability / (1 - probability)) };
}

/** Converts log-odds decibans into a probability without overflowing at the extremes. */
export function decibansToProbability(weight: EvidenceWeight): Probability {
  const weightDecibans: unknown = weight?.weightDecibans;
  if (typeof weightDecibans !== 'number' || Number.isNaN(weightDecibans)) {
    throw new RangeError('Weight in decibans must be defined.');
  }
  if (weightDecibans >= 0) {
    return { probability: 1 / (1 + 10 ** (-weightDecibans / 10)) };
  }
  const odds = 10 ** (weightDecibans / 10);
  return { probability: odds / (1 + odds) };
}
