export { aggregateEvidence } from './aggregation.js';
export {
  color,
  triangleColor,
  DEFAULT_COLOR_OPTIONS,
  trianglePosition,
} from './color.js';
export { jeffreysBand } from './jeffreys.js';
export { decibansToProbability, probabilityToDecibans } from './conversions.js';
export { boundProbability } from './probability-bounds.js';
export { buildEvidenceDiagram } from './evidence-diagram.js';
export type { JeffreysBand } from './jeffreys.js';
export type { ProbabilityBound, ProbabilityBoundsOptions } from './probability-bounds.js';
export type {
  EvidenceContribution,
  EvidenceDiagram,
  EvidencePoint,
  EvidenceStep,
} from './evidence-diagram.js';
export type {
  ColorOptions,
  EvidenceSummary,
  EvidenceWeight,
  Probability,
  TrianglePosition,
} from './types.js';
