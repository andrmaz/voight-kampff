import type { RawFeatureSignal } from './extractors.js';
import { DEFAULT_EXTRACTOR_ORDER } from './extractors.js';

/** Rubric identity for manifests and API (not proof of sentience — documented heuristics). */
export const SCORING_RUBRIC_ID = 'vk-behavioral-markers-v2';
export const SCORING_RUBRIC_VERSION = '2.0.0';

/** Weights sum to 1; contribution = value * weight * maxScore. */
export const RUBRIC_WEIGHTS: Record<string, number> = {
  'length-band': 0.15,
  'affective-lexicon': 0.25,
  'syntactic-elaboration': 0.2,
  'deflection-resistance': 0.25,
  'first-person-stance': 0.15,
};

export const COMPOSITE_MAX_SCORE = 100;

export interface ScoredFeature {
  id: string;
  label: string;
  weight: number;
  value: number;
  contribution: number;
  rationale: string;
}

export interface ScoreBreakdown {
  rubricId: string;
  rubricVersion: string;
  /** Weighted composite 0…maxScore (interpretable as “signal strength”, not sentience). */
  score: number;
  maxScore: number;
  rationale: string[];
  features: ScoredFeature[];
  interpretationNote: string;
}

const INTERPRETATION_NOTE =
  'Composite reflects heuristic text signals only (length, affect words, structure, deflection, first person). It does not measure consciousness or sentience.';

function runExtractors(text: string): RawFeatureSignal[] {
  return DEFAULT_EXTRACTOR_ORDER.map((fn) => fn(text));
}

export function scoreWithPipeline(rubricId: string, subjectUtterance: string): ScoreBreakdown {
  const raw = runExtractors(subjectUtterance);
  const maxScore = COMPOSITE_MAX_SCORE;
  const features: ScoredFeature[] = raw.map((s) => {
    const weight = RUBRIC_WEIGHTS[s.id] ?? 0;
    const contribution = weight * s.value * maxScore;
    return {
      id: s.id,
      label: s.label,
      weight,
      value: s.value,
      contribution,
      rationale: s.rationale,
    };
  });

  let composite = features.reduce((acc, f) => acc + f.contribution, 0);
  composite = Math.min(maxScore, Math.max(0, composite));
  const score = Math.round(composite * 10) / 10;

  const rationale: string[] = [
    `Rubric ${SCORING_RUBRIC_ID}@${SCORING_RUBRIC_VERSION} (mapped from step rubric "${rubricId}").`,
    ...features
      .filter((f) => f.contribution >= maxScore * 0.08 || f.value <= 0.2)
      .sort((a, b) => b.contribution - a.contribution)
      .slice(0, 5)
      .map((f) => `${f.label}: ${f.rationale}`),
  ];

  return {
    rubricId: SCORING_RUBRIC_ID,
    rubricVersion: SCORING_RUBRIC_VERSION,
    score,
    maxScore,
    rationale,
    features,
    interpretationNote: INTERPRETATION_NOTE,
  };
}
