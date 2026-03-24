import 'dotenv/config';

import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { buildApp } from './api/app.js';
import { loadServerEnv } from './config/env.js';
import { logEvent } from './lib/log.js';
import { createModelConnector } from './modules/model-connector/index.js';
import { createScenarioLibrary } from './modules/scenario-library/index.js';
import { createSessionOrchestrator } from './modules/session-orchestrator/index.js';
import { createSessionStore } from './modules/session-store/index.js';

const { port: PORT, dbPath, authToken } = loadServerEnv();

mkdirSync(dirname(dbPath), { recursive: true });

const sessionStore = createSessionStore({ dbPath });
const scenarioLibrary = createScenarioLibrary();
const modelConnector = createModelConnector();

const orchestrator = createSessionOrchestrator({
  scenarioLibrary,
  sessionStore,
  modelConnector,
  logEvent,
});

const app = await buildApp({ orchestrator, authToken });

await app.listen({ port: PORT, host: '0.0.0.0' });
logEvent('server_listen', {
  port: PORT,
  subjectModelConnectorId: modelConnector.id,
  auth: Boolean(authToken),
});
