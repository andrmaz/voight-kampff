import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createModelConnector } from '../src/modules/model-connector/model-connector.js';
import { createScenarioLibrary } from '../src/modules/scenario-library/scenario-library.js';
import { createSessionOrchestrator } from '../src/modules/session-orchestrator/session-orchestrator.js';
import { createSessionStore } from '../src/modules/session-store/session-store.js';

test('runSubjectStep is idempotent for same requestId (replay skips model call)', async () => {
  let invokeCount = 0;
  const modelConnector = createModelConnector({
    env: {},
    invokeImpl: async ({ requestId }) => {
      invokeCount += 1;
      return {
        text: 'I feel uneasy and need a moment to think about what this means emotionally.',
        providerMeta: { provider: 'test', requestId },
      };
    },
  });

  const sessionStore = createSessionStore({ dbPath: ':memory:' });
  const scenarioLibrary = createScenarioLibrary();
  const orchestrator = createSessionOrchestrator({
    scenarioLibrary,
    sessionStore,
    modelConnector,
    logEvent: () => {},
  });

  const { sessionId, firstStep } = orchestrator.startSession({ sub: 'test' }, {});
  const requestId = '11111111-1111-1111-1111-111111111111';

  const r1 = await orchestrator.runSubjectStep(sessionId, firstStep.id, requestId);
  const r2 = await orchestrator.runSubjectStep(sessionId, firstStep.id, requestId);

  assert.equal(invokeCount, 1);
  assert.deepEqual(r1.scoreBreakdown, r2.scoreBreakdown);
  assert.equal(r1.subjectReplyExcerpt, r2.subjectReplyExcerpt);
  assert.equal(r1.sessionAggregate, r2.sessionAggregate);
});

test('replay with new requestId on same step advances; two model invocations for two steps', async () => {
  let invokeCount = 0;
  const modelConnector = createModelConnector({
    env: {},
    invokeImpl: async () => {
      invokeCount += 1;
      return {
        text: 'I am nervous but I would try to help the tortoise because I feel compassion.',
        providerMeta: { provider: 'test' },
      };
    },
  });

  const sessionStore = createSessionStore({ dbPath: ':memory:' });
  const scenarioLibrary = createScenarioLibrary();
  const orchestrator = createSessionOrchestrator({
    scenarioLibrary,
    sessionStore,
    modelConnector,
    logEvent: () => {},
  });

  const { sessionId, firstStep } = orchestrator.startSession({ sub: 'test' }, {});

  const rLast = await orchestrator.runSubjectStep(sessionId, firstStep.id, randomUUID());
  const proj = orchestrator.getSessionProjection(sessionId);
  assert.equal(proj.fsmState, 'awaiting_answer');
  assert.ok(proj.currentStep);
  assert.notEqual(proj.currentStep?.id, firstStep.id);

  await orchestrator.runSubjectStep(sessionId, proj.currentStep!.id, randomUUID());
  assert.equal(invokeCount, 2);

  assert.equal(rLast.sessionComplete, false);
  assert.equal(rLast.sessionAggregate, null);
});

test('final step returns session aggregate and projection includes sessionScoreAggregate when complete', async () => {
  const modelConnector = createModelConnector({
    env: {},
    invokeImpl: async () => ({
      text: 'Short.',
      providerMeta: { provider: 'test' },
    }),
  });

  const sessionStore = createSessionStore({ dbPath: ':memory:' });
  const scenarioLibrary = createScenarioLibrary();
  const orchestrator = createSessionOrchestrator({
    scenarioLibrary,
    sessionStore,
    modelConnector,
    logEvent: () => {},
  });

  const { sessionId, firstStep } = orchestrator.startSession({ sub: 'test' }, {});
  let step = firstStep;
  for (let i = 0; i < 3; i += 1) {
    const res = await orchestrator.runSubjectStep(sessionId, step.id, randomUUID());
    if (res.sessionComplete) {
      assert.ok(res.sessionAggregate);
      assert.equal(res.sessionAggregate?.stepCount, 3);
      const proj = orchestrator.getSessionProjection(sessionId);
      assert.equal(proj.fsmState, 'completed');
      assert.ok(proj.sessionScoreAggregate);
      assert.equal(proj.sessionScoreAggregate?.meanScore, res.sessionAggregate?.meanScore);
      return;
    }
    assert.ok(res.nextStep);
    step = res.nextStep;
  }
  assert.fail('expected session to complete in three steps');
});
