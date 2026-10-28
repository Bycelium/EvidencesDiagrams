export type EvidenceSummary = {
  netWeightDecibans: number;
  absoluteWeightDecibans: number;
  dissonance: number;
};

export type EvidenceWeight = {
  readonly weightDecibans: number;
};

export type Probability = {
  readonly probability: number;
};

export type ProbabilityBoundsOptions = {
  readonly minPriorDecibans?: number;
  readonly maxPriorDecibans?: number;
};

export type TrianglePosition = {
  readonly x: number;
  readonly height: number;
};

export type ColorOptions = ProbabilityBoundsOptions & {
  readonly saturationThresholdDecibans?: number;
  readonly anchors?: {
    readonly gray?: string;
    readonly yellow?: string;
    readonly green?: string;
    readonly red?: string;
  };
};
