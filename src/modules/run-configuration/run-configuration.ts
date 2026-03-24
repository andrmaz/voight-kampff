import { randomUUID } from 'node:crypto';
import type { Scenario } from '../scenario-library/scenario-library.js';

export interface RunManifest {
  runManifestId: string;
  scenarioId: string;
  scenarioVersion: string;
  subjectModelConnectorId: string;
  /** Deterministic scoring pipeline identity (for comparing runs). */
  scoringRubricId: string;
  scoringRubricVersion: string;
  seed: string | null;
  createdAt: string;
  environment: { node: string };
}

/**
 * Immutable run manifest for reproducibility / audit trail (MVP).
 */
export function createRunManifest(p: {
  scenario: Scenario;
  subjectModelConnectorId: string;
  scoringRubricId: string;
  scoringRubricVersion: string;
  seed?: string;
}): RunManifest {
  return {
    runManifestId: randomUUID(),
    scenarioId: p.scenario.id,
    scenarioVersion: p.scenario.version,
    subjectModelConnectorId: p.subjectModelConnectorId,
    scoringRubricId: p.scoringRubricId,
    scoringRubricVersion: p.scoringRubricVersion,
    seed: p.seed ?? null,
    createdAt: new Date().toISOString(),
    environment: {
      node: process.version,
    },
  };
}
