import { aggregateEvidence } from './aggregation.js';
import { color } from './color.js';
import { jeffreysBand, type JeffreysBand } from './jeffreys.js';
import { boundProbability, type ProbabilityBound } from './probability-bounds.js';
import type { ColorOptions, EvidenceSummary, EvidenceWeight } from './types.js';

export type EvidenceContribution = EvidenceWeight & {
  readonly id: string | number;
};

export type EvidencePoint = {
  readonly netWeightDecibans: number;
  readonly absoluteWeightDecibans: number;
};

export type EvidenceStep = {
  readonly id: string | number;
  readonly weightDecibans: number;
  readonly start: EvidencePoint;
  readonly end: EvidencePoint;
};

export type EvidenceDiagram = {
  readonly summary: EvidenceSummary;
  readonly steps: readonly EvidenceStep[];
  readonly resultant: {
    readonly start: EvidencePoint;
    readonly end: EvidencePoint;
    readonly jeffreysBand: JeffreysBand;
    readonly color: string;
  };
  readonly probability: ProbabilityBound;
};

/** Builds the raw data for a weight-of-evidence diagram. */
export function buildEvidenceDiagram(
  contributions: readonly EvidenceContribution[],
  options: ColorOptions = {},
): EvidenceDiagram {
  if (!Array.isArray(contributions)) {
    throw new RangeError('Contributions must be an array.');
  }

  const summary = aggregateEvidence(contributions);
  const ids = new Set<string | number>();
  const steps: EvidenceStep[] = [];
  let currentPoint: EvidencePoint = { netWeightDecibans: 0, absoluteWeightDecibans: 0 };
  let netWeightDecibans = 0;
  let absoluteWeightDecibans = 0;

  for (let index = 0; index < contributions.length; index += 1) {
    const contribution = contributions[index]!;
    const id = readId(contribution);
    if (ids.has(id)) {
      throw new RangeError(`Contribution id ${String(id)} is duplicated.`);
    }
    ids.add(id);

    const weightDecibans = contribution.weightDecibans;
    const start = currentPoint;
    netWeightDecibans += weightDecibans;
    absoluteWeightDecibans += Math.abs(weightDecibans);
    const cumulative = Number.isFinite(netWeightDecibans)
      && Number.isFinite(absoluteWeightDecibans)
      ? { netWeightDecibans, absoluteWeightDecibans }
      : aggregateEvidence(contributions.slice(0, index + 1));
    const end = {
      netWeightDecibans: cumulative.netWeightDecibans,
      absoluteWeightDecibans: cumulative.absoluteWeightDecibans,
    };
    steps.push({ id, weightDecibans, start, end });
    currentPoint = end;
  }

  const resultantColor = color(summary, options);

  return {
    summary,
    steps,
    resultant: {
      start: {
        netWeightDecibans: 0,
        absoluteWeightDecibans: summary.absoluteWeightDecibans,
      },
      end: {
        netWeightDecibans: summary.netWeightDecibans,
        absoluteWeightDecibans: summary.absoluteWeightDecibans,
      },
      jeffreysBand: jeffreysBand({ weightDecibans: summary.netWeightDecibans }),
      color: resultantColor,
    },
    probability: boundProbability(summary, options),
  };
}

function readId(contribution: EvidenceContribution): string | number {
  const id: unknown = contribution?.id;
  if (typeof id === 'string') return id;
  if (typeof id === 'number' && Number.isFinite(id)) return id;
  throw new RangeError('Each contribution must contain a string or finite numeric id.');
}
