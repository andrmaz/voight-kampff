import {
  type ScoreBreakdown,
  SCORING_RUBRIC_ID,
  SCORING_RUBRIC_VERSION,
  scoreWithPipeline,
} from './pipeline.js';

export type { ScoreBreakdown, ScoredFeature } from './pipeline.js';
export {
  COMPOSITE_MAX_SCORE,
  RUBRIC_WEIGHTS,
  SCORING_RUBRIC_ID,
  SCORING_RUBRIC_VERSION,
} from './pipeline.js';

export { aggregateSessionStepScores, type SessionScoreAggregate } from './session-aggregate.js';

/** @deprecated Prefer SCORING_RUBRIC_VERSION */
export const SCORING_VERSION = SCORING_RUBRIC_VERSION;

/**
 * Score subject utterance with the deterministic pipeline.
 * Maps legacy rubric ids to the same v2 pipeline for comparability.
 */
export function scoreStep(p: { rubricId: string; modelResponse: string }): ScoreBreakdown {
  const supported = new Set(['vk-behavioral-markers-v2', 'vk-emotional-signal']);
  if (!supported.has(p.rubricId)) {
    return {
      rubricId: SCORING_RUBRIC_ID,
      rubricVersion: SCORING_RUBRIC_VERSION,
      score: 0,
      maxScore: 100,
      rationale: [`Unknown rubricId "${p.rubricId}"; no pipeline registered. Returning neutral composite.`],
      features: [],
      interpretationNote:
        'Unknown rubric — no features computed. This is not a statement about the subject model.',
    };
  }
  return scoreWithPipeline(p.rubricId, p.modelResponse);
}
