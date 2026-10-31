import {
  DEFAULT_COLOR_OPTIONS,
  aggregateEvidence,
  boundProbability,
  buildEvidenceDiagram,
  color,
  decibansToProbability,
  jeffreysBand,
  probabilityToDecibans,
  triangleColor,
  trianglePosition,
  type ColorOptions,
  type EvidenceContribution,
  type EvidenceDiagram,
  type EvidencePoint,
  type EvidenceStep,
  type EvidenceSummary,
  type EvidenceWeight,
  type JeffreysBand,
  type Probability,
  type ProbabilityBound,
  type ProbabilityBoundsOptions,
  type TrianglePosition,
} from '@bycelium/evidence-diagrams';

const enrichedContribution = {
  weightDecibans: 12,
  reference: 'evidence-1',
};
const validatedContribution: EvidenceWeight = enrichedContribution;
void validatedContribution;

const summary: EvidenceSummary = aggregateEvidence([enrichedContribution]);
void summary;

const boundsOptions: ProbabilityBoundsOptions = { minPriorDecibans: -10 };
const bound: ProbabilityBound = boundProbability(summary, boundsOptions);
if (bound.direction !== 'indeterminate') {
  const boundedProbability: number = bound.probability;
  const displayPercentage: number = bound.displayPercentage;
  void boundedProbability;
  void displayPercentage;
} else {
  const reason: 'no-evidence' | 'dissonant-evidence' = bound.reason;
  const message: 'No evidence' | 'Dissonant evidence' = bound.text;
  void reason;
  void message;
  // @ts-expect-error An indeterminate bound has no probability.
  bound.probability;
  // @ts-expect-error An indeterminate bound has no display percentage.
  bound.displayPercentage;
}

// @ts-expect-error Priors must be numeric when provided.
const invalidBoundsOptions: ProbabilityBoundsOptions = { maxPriorDecibans: '15' };
void invalidBoundsOptions;

// @ts-expect-error The API accepts named contributions rather than bare numbers.
aggregateEvidence([12]);

const probability: Probability = decibansToProbability(
  probabilityToDecibans({ probability: 0.9 }),
);
void probability;
const band: JeffreysBand = jeffreysBand(probabilityToDecibans({ probability: 0.9 }));
void band;

// @ts-expect-error Probability conversions require a named probability.
probabilityToDecibans(0.9);
// @ts-expect-error Deciban functions require a named weight.
jeffreysBand(10);

const colorOptions: ColorOptions = {
  minPriorDecibans: -15,
  maxPriorDecibans: 15,
  saturationThresholdDecibans: 20,
  anchors: { green: '#00ff00' },
};
void colorOptions;
void DEFAULT_COLOR_OPTIONS;
const summaryColor: string = color(summary, colorOptions);
void summaryColor;
const position: TrianglePosition = trianglePosition(summary, colorOptions);
const positionColor: string = triangleColor(position, colorOptions);
void positionColor;
// @ts-expect-error Color priors must be numeric.
color(summary, { minPriorDecibans: '0' });

// @ts-expect-error An anchor remains a hexadecimal string in the public contract.
const invalidColorOptions: ColorOptions = { anchors: { red: 123 } };
void invalidColorOptions;

const diagramContributions: readonly EvidenceContribution[] = [
  { id: 'source-a', weightDecibans: 12 },
  { id: 2, weightDecibans: -5 },
];
const diagram: EvidenceDiagram = buildEvidenceDiagram(
  diagramContributions,
  colorOptions,
);
const step: EvidenceStep = diagram.steps[0]!;
const point: EvidencePoint = step.end;
const id: string | number = step.id;
const resultantColor: string = diagram.resultant.color;
const diagramProbability: ProbabilityBound = diagram.probability;
void point;
void id;
void resultantColor;
void diagramProbability;

// @ts-expect-error A diagram contribution requires a stable id.
buildEvidenceDiagram([{ weightDecibans: 12 }]);
// @ts-expect-error A numeric id must be a number.
buildEvidenceDiagram([{ id: true, weightDecibans: 12 }]);

function verifyDiagramImmutability(
  model: EvidenceDiagram,
  coordinate: EvidencePoint,
  segment: EvidenceStep,
): void {
  // @ts-expect-error Public coordinates are immutable.
  coordinate.netWeightDecibans = 0;
  // @ts-expect-error Public steps are immutable.
  segment.end = coordinate;
  // @ts-expect-error The public resultant is immutable.
  model.resultant.end = coordinate;
  // @ts-expect-error The chronological collection is read-only.
  model.steps.push(segment);
}
void verifyDiagramImmutability;
