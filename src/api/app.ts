import Fastify from 'fastify';
import cors from '@fastify/cors';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { projectRoot } from '../lib/paths.js';
import type { SessionOrchestrator } from '../modules/session-orchestrator/session-orchestrator.js';
import { mapErrorToHttp } from './error-map.js';

const publicDir = join(projectRoot, 'public');

export interface BuildAppOptions {
  orchestrator: SessionOrchestrator;
  authToken?: string;
}

export async function buildApp(opts: BuildAppOptions) {
  const app = Fastify({ logger: false });

  await app.register(cors, { origin: true });

  app.addHook('preHandler', async (request, reply) => {
    if (request.url.startsWith('/sessions')) {
      const expected = opts.authToken;
      if (expected) {
        const auth = request.headers.authorization ?? '';
        const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
        if (token !== expected) {
          return reply.code(401).send({
            error: 'UNAUTHORIZED',
            message: 'Invalid or missing bearer token',
          });
        }
      }
    }
  });

  app.post<{ Body: { scenarioId?: string } }>('/sessions/start', async (request, reply) => {
    try {
      const body =
        typeof request.body === 'object' && request.body !== null ? request.body : {};
      const userContext = { sub: 'dev-evaluator' };
      const result = opts.orchestrator.startSession(userContext, {
        scenarioId: body.scenarioId,
      });
      reply.code(201).send(result);
    } catch (err) {
      const mapped = mapErrorToHttp(err);
      reply.code(mapped.status).send(mapped.body);
    }
  });

  app.post<{
    Params: { sessionId: string; stepId: string };
    Body: { requestId?: string };
  }>('/sessions/:sessionId/steps/:stepId/respond', async (request, reply) => {
    try {
      const { sessionId, stepId } = request.params;
      const body =
        typeof request.body === 'object' && request.body !== null ? request.body : {};
      const requestId = body.requestId;
      if (typeof requestId !== 'string' || requestId.length === 0) {
        reply.code(400).send({ error: 'VALIDATION_ERROR', message: 'requestId is required' });
        return;
      }
      const result = await opts.orchestrator.runSubjectStep(sessionId, stepId, requestId);
      reply.send(result);
    } catch (err) {
      const mapped = mapErrorToHttp(err);
      reply.code(mapped.status).send(mapped.body);
    }
  });

  app.get<{ Params: { sessionId: string } }>('/sessions/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const result = opts.orchestrator.getSessionProjection(sessionId);
      reply.send(result);
    } catch (err) {
      const mapped = mapErrorToHttp(err);
      reply.code(mapped.status).send(mapped.body);
    }
  });

  app.get('/api/health', async (_request, reply) => {
    reply.send({ ok: true });
  });

  app.get('/', async (_request, reply) => {
    const html = readFileSync(join(publicDir, 'index.html'), 'utf8');
    reply.type('text/html; charset=utf-8').send(html);
  });

  return app;
}
