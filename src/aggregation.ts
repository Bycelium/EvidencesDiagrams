import type { EvidenceSummary, EvidenceWeight } from './types.js';

/** Aggregates independent weight-of-evidence contributions expressed in decibans. */
export function aggregateEvidence(contributions: readonly EvidenceWeight[]): EvidenceSummary {
  let netWeightDecibans = 0;
  let absoluteWeightDecibans = 0;
  let maximumWeight = 0;

  for (const contribution of contributions) {
    const weight: unknown = contribution?.weightDecibans;
    if (typeof weight !== 'number' || !Number.isFinite(weight)) {
      throw new RangeError('Each contribution must contain a finite weightDecibans value.');
    }
    netWeightDecibans += weight;
    absoluteWeightDecibans += Math.abs(weight);
    maximumWeight = Math.max(maximumWeight, Math.abs(weight));
  }

  if (absoluteWeightDecibans === 0) {
    return { netWeightDecibans: 0, absoluteWeightDecibans: 0, dissonance: 0 };
  }

  let dissonance: number;
  if (Number.isFinite(netWeightDecibans) && Number.isFinite(absoluteWeightDecibans)) {
    dissonance = 1 - Math.abs(netWeightDecibans) / absoluteWeightDecibans;
  } else {
    let normalizedNetWeight = 0;
    let normalizedAbsoluteWeight = 0;
    for (const { weightDecibans: weight } of contributions) {
      normalizedNetWeight += weight / maximumWeight;
      normalizedAbsoluteWeight += Math.abs(weight) / maximumWeight;
    }
    netWeightDecibans = normalizedNetWeight * maximumWeight;
    absoluteWeightDecibans = normalizedAbsoluteWeight * maximumWeight;
    dissonance = 1 - Math.abs(normalizedNetWeight) / normalizedAbsoluteWeight;
  }

  return { netWeightDecibans, absoluteWeightDecibans, dissonance };
}
