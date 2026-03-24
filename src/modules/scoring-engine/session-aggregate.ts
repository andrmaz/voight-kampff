import type { ScoreBreakdown } from './pipeline.js';
import { SCORING_RUBRIC_ID, SCORING_RUBRIC_VERSION } from './pipeline.js';

export interface TranscriptEntryLike {
  scoreBreakdown: ScoreBreakdown;
}

export interface SessionScoreAggregate {
  rubricId: string;
  rubricVersion: string;
  stepCount: number;
  meanScore: number;
  minScore: number;
  maxScore: number;
  /** Sample standard deviation of step scores (0 if stepCount < 2). */
  stdDev: number;
  sumScore: number;
  notes: string[];
}

function stdDevSample(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const v =
    values.reduce((acc, x) => acc + (x - mean) * (x - mean), 0) / (values.length - 1);
  return Math.sqrt(v);
}

/**
 * Session-level summary over completed steps (same rubric assumed per transcript).
 */
export function aggregateSessionStepScores(transcript: TranscriptEntryLike[]): SessionScoreAggregate | null {
  if (transcript.length === 0) return null;
  const scores = transcript.map((e) => e.scoreBreakdown.score);
  const sumScore = scores.reduce((a, b) => a + b, 0);
  const stepCount = scores.length;
  const meanScore = sumScore / stepCount;
  const minScore = Math.min(...scores);
  const maxScore = Math.max(...scores);
  const stdDev = stdDevSample(scores);
  const first = transcript[0]?.scoreBreakdown;
  const rubricId = first?.rubricId ?? SCORING_RUBRIC_ID;
  const rubricVersion = first?.rubricVersion ?? SCORING_RUBRIC_VERSION;

  const notes: string[] = [
    `Session aggregate over ${stepCount} step(s): mean ${meanScore.toFixed(1)}, range [${minScore.toFixed(1)}, ${maxScore.toFixed(1)}].`,
  ];
  if (stepCount >= 2 && stdDev > 15) {
    notes.push('High variance across steps — responses were inconsistent in heuristic signal strength.');
  } else if (stepCount >= 2 && stdDev < 5) {
    notes.push('Low variance across steps — similar heuristic profile each time.');
  }

  return {
    rubricId,
    rubricVersion,
    stepCount,
    meanScore: Math.round(meanScore * 10) / 10,
    minScore: Math.round(minScore * 10) / 10,
    maxScore: Math.round(maxScore * 10) / 10,
    stdDev: Math.round(stdDev * 10) / 10,
    sumScore: Math.round(sumScore * 10) / 10,
    notes,
  };
}
