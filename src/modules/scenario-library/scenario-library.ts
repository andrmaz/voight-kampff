import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ScenarioNotFound } from '../../domain/domain-error.js';
import { projectRoot } from '../../lib/paths.js';

const DEFAULT_FILE = 'v1.json';

export interface ScenarioStep {
  id: string;
  prompt: string;
  rubricId: string;
}

export interface Scenario {
  id: string;
  version: string;
  title?: string;
  steps: ScenarioStep[];
}

export interface ScenarioLibraryOptions {
  scenariosDir?: string;
  fileName?: string;
}

export function createScenarioLibrary(opts: ScenarioLibraryOptions = {}) {
  const dir = opts.scenariosDir ?? join(projectRoot, 'content', 'scenarios');
  const fileName = opts.fileName ?? DEFAULT_FILE;

  return {
    loadScenarioVersion(scenarioId?: string): Scenario {
      const path = join(dir, fileName);
      const raw = readFileSync(path, 'utf8');
      const data = JSON.parse(raw) as Scenario;
      if (scenarioId != null && scenarioId !== '' && data.id !== scenarioId) {
        throw new ScenarioNotFound({ message: `Unknown scenario: ${scenarioId}` });
      }
      return data;
    },
  };
}

export type ScenarioLibrary = ReturnType<typeof createScenarioLibrary>;
