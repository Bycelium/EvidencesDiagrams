import type { EvidenceWeight } from './types.js';

type PositiveJeffreysBand =
  | 'anecdotal'
  | 'moderate'
  | 'strong'
  | 'very strong'
  | 'decisive';

export type JeffreysBand =
  | 'none'
  | PositiveJeffreysBand
  | `${PositiveJeffreysBand} against`;

/** Names a weight-of-evidence band on the deciban Jeffreys scale. */
export function jeffreysBand(weight: EvidenceWeight): JeffreysBand {
  const weightDecibans: unknown = weight?.weightDecibans;
  if (typeof weightDecibans !== 'number' || Number.isNaN(weightDecibans)) {
    throw new RangeError('Weight in decibans must be defined.');
  }
  const absoluteWeight = Math.abs(weightDecibans);
  if (absoluteWeight === 0) return 'none';

  let band: PositiveJeffreysBand;
  if (absoluteWeight < 5) band = 'anecdotal';
  else if (absoluteWeight < 10) band = 'moderate';
  else if (absoluteWeight < 15) band = 'strong';
  else if (absoluteWeight < 20) band = 'very strong';
  else band = 'decisive';

  return weightDecibans < 0 ? `${band} against` : band;
}
