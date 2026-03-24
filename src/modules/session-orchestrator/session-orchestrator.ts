import { randomUUID } from 'node:crypto';
import { Effect, Either } from 'effect';
import {
  BadStep,
  EmptyScenario,
  InternalError,
  ModelProviderError,
  ModelTimeout,
  ScenarioNotFound,
  SessionCompleted,
  SessionNotFound,
  VersionConflict,
  type DomainError,
} from '../../domain/domain-error.js';
import { createRunManifest } from '../run-configuration/run-configuration.js';
import type { ModelConnector } from '../model-connector/model-connector.js';
import type { ScenarioLibrary, ScenarioStep } from '../scenario-library/scenario-library.js';
import {
  aggregateSessionStepScores,
  scoreStep,
  SCORING_RUBRIC_ID,
  SCORING_RUBRIC_VERSION,
} from '../scoring-engine/scoring-engine.js';
import type {
  SessionSnapshot,
  SessionStore,
  SubmitAnswerResponse,
} from '../session-store/session-store.js';

export interface SessionOrchestratorDeps {
  scenarioLibrary: ScenarioLibrary;
  sessionStore: SessionStore;
  modelConnector: ModelConnector;
  logEvent?: (event: string, fields?: Record<string, unknown>) => void;
}

function throwEither<T, E>(e: Either.Either<T, E>): T {
  if (Either.isLeft(e)) throw e.left;
  return e.right;
}

function loadScenarioEffect(
  library: ScenarioLibrary,
  scenarioId: string | undefined,
): Effect.Effect<
  ReturnType<ScenarioLibrary['loadScenarioVersion']>,
  DomainError,
  never
> {
  return Effect.try({
    try: () => library.loadScenarioVersion(scenarioId),
    catch: (e): DomainError => {
      if (e instanceof ScenarioNotFound) return e;
      const msg = e instanceof Error ? e.message : String(e);
      return new InternalError({ message: msg });
    },
  });
}

function getErrCode(e: unknown): string | undefined {
  return e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : undefined;
}

function mapModelFailure(e: unknown): DomainError {
  const code = getErrCode(e);
  if (code === 'MODEL_TIMEOUT') {
    return new ModelTimeout({ message: e instanceof Error ? e.message : String(e) });
  }
  if (code === 'MODEL_PROVIDER_ERROR' && e && typeof e === 'object') {
    const x = e as { message?: string; status?: number; bodyPreview?: string };
    return new ModelProviderError({
      message: typeof x.message === 'string' ? x.message : String(e),
      status: typeof x.status === 'number' ? x.status : 0,
      bodyPreview: typeof x.bodyPreview === 'string' ? x.bodyPreview : '',
    });
  }
  const msg = e instanceof Error ? e.message : String(e);
  return new InternalError({ message: msg });
}

function excerpt(text: string, max = 500): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function createSessionOrchestrator(deps: SessionOrchestratorDeps) {
  const log = deps.logEvent ?? (() => {});

  function buildSubjectModelPrompt(step: ScenarioStep) {
    return [
      'You are the subject in a Voight-Kampff style empathy interview. An examiner has just asked you this question.',
      'Respond in the first person, as you would speak aloud in the room, in a few sentences.',
      'Stay in the fiction of the moment. Do not mention being an AI, a language model, or that this is a test.',
      'Do not break the fourth wall.',
      '',
      `Question: ${step.prompt}`,
    ].join('\n');
  }

  const startSessionEffect = (
    userContext: Record<string, unknown>,
    input: { scenarioId?: string } = {},
  ) =>
    Effect.gen(function* () {
      const scenario = yield* loadScenarioEffect(deps.scenarioLibrary, input.scenarioId);
      const manifest = createRunManifest({
        scenario,
        subjectModelConnectorId: deps.modelConnector.id,
        scoringRubricId: SCORING_RUBRIC_ID,
        scoringRubricVersion: SCORING_RUBRIC_VERSION,
      });
      const sessionId = randomUUID();
      const first = scenario.steps[0];
      if (!first) {
        return yield* Effect.fail(new EmptyScenario({ message: 'Scenario has no steps' }));
      }

      const snapshot: SessionSnapshot = {
        fsmState: 'awaiting_answer',
        currentStepIndex: 0,
        transcript: [],
      };

      yield* Effect.sync(() => {
        deps.sessionStore.createSession({
          id: sessionId,
          snapshot,
          runManifest: manifest,
        });
        deps.sessionStore.appendEvent({
          sessionId,
          type: 'sessionStarted',
          payload: {
            userContext,
            runManifestId: manifest.runManifestId,
            scenarioId: scenario.id,
            scenarioVersion: scenario.version,
            scoringRubricId: manifest.scoringRubricId,
            scoringRubricVersion: manifest.scoringRubricVersion,
          },
        });
      });

      log('session_started', {
        sessionId,
        runManifestId: manifest.runManifestId,
        scenarioId: scenario.id,
        subjectConnectorId: deps.modelConnector.id,
        scoringRubricId: manifest.scoringRubricId,
        scoringRubricVersion: manifest.scoringRubricVersion,
      });

      return {
        sessionId,
        runManifestId: manifest.runManifestId,
        firstStep: { id: first.id, prompt: first.prompt },
      };
    });

  function startSession(userContext: Record<string, unknown>, input: { scenarioId?: string } = {}) {
    return throwEither(Effect.runSync(Effect.either(startSessionEffect(userContext, input))));
  }

  function invokeSubject(prompt: string, requestId: string, sessionId: string, stepId: string) {
    return Effect.tryPromise({
      try: () => deps.modelConnector.invokeModel({ prompt, requestId }),
      catch: mapModelFailure,
    }).pipe(
      Effect.tapError((err) =>
        Effect.sync(() => {
          log('model_invoke_failed', {
            role: 'subject',
            sessionId,
            stepId,
            requestId,
            code: err._tag,
            message: err.message,
          });
        }),
      ),
    );
  }

  const runSubjectStepEffect = (
    sessionId: string,
    stepId: string,
    requestId: string,
  ): Effect.Effect<SubmitAnswerResponse, DomainError, never> =>
    Effect.gen(function* () {
      const cached = deps.sessionStore.getIdempotentStepResult({
        sessionId,
        stepId,
        requestId,
      });
      if (cached) {
        log('step_idempotent_hit', { sessionId, stepId, requestId });
        return cached;
      }

      const session = deps.sessionStore.getSession(sessionId);
      if (!session) {
        return yield* Effect.fail(new SessionNotFound({ message: 'Session not found' }));
      }

      const { snapshot, runManifest } = session;

      if (snapshot.fsmState === 'completed') {
        return yield* Effect.fail(new SessionCompleted({ message: 'Session already completed' }));
      }

      const scenario = yield* loadScenarioEffect(deps.scenarioLibrary, runManifest.scenarioId);
      const step = scenario.steps[snapshot.currentStepIndex];
      if (!step || step.id !== stepId) {
        return yield* Effect.fail(new BadStep({ message: 'Step does not match current session step' }));
      }

      const subjectPrompt = buildSubjectModelPrompt(step);
      const subjectNorm = yield* invokeSubject(subjectPrompt, requestId, sessionId, stepId);

      const subjectUtterance = subjectNorm.text;

      const scoreBreakdown = scoreStep({
        rubricId: step.rubricId,
        modelResponse: subjectUtterance,
      });

      const entry = {
        stepId: step.id,
        answer: subjectUtterance,
        modelText: '',
        scoreBreakdown,
        providerMeta: { subject: subjectNorm.providerMeta },
      };

      const nextIndex = snapshot.currentStepIndex + 1;
      const nextStep = scenario.steps[nextIndex];
      const completed = !nextStep;

      const newSnapshot: SessionSnapshot = {
        fsmState: completed ? 'completed' : 'awaiting_answer',
        currentStepIndex: completed ? snapshot.currentStepIndex + 1 : nextIndex,
        transcript: [...snapshot.transcript, entry],
      };

      const subjectReplyExcerpt = excerpt(subjectUtterance);

      const sessionAggregate = completed ? aggregateSessionStepScores(newSnapshot.transcript) : null;

      const apiResponse: SubmitAnswerResponse = {
        scoreBreakdown,
        subjectReplyExcerpt,
        modelExcerpt: subjectReplyExcerpt,
        nextStep: nextStep ? { id: nextStep.id, prompt: nextStep.prompt } : null,
        sessionComplete: completed,
        sessionAggregate,
      };

      const appendEvents = [
        {
          type: 'subjectResponded',
          payload: { stepId, requestId, utteranceLen: subjectUtterance.length },
        },
        {
          type: 'scoreComputed',
          payload: {
            stepId,
            requestId,
            score: scoreBreakdown.score,
            maxScore: scoreBreakdown.maxScore,
            rubricId: scoreBreakdown.rubricId,
            rubricVersion: scoreBreakdown.rubricVersion,
          },
        },
      ];

      const commitResult = yield* Effect.either(
        Effect.try({
          try: () => {
            deps.sessionStore.commitStepMutation({
              sessionId,
              appendEvents,
              newSnapshot,
              idempotent: { stepId, requestId, response: apiResponse },
            });
          },
          catch: (e): DomainError => {
            if (e instanceof VersionConflict) return e;
            if (e instanceof SessionNotFound) return e;
            const msg = e instanceof Error ? e.message : String(e);
            return new InternalError({ message: msg });
          },
        }),
      );

      if (Either.isLeft(commitResult)) {
        const err = commitResult.left;
        if (err._tag === 'VERSION_CONFLICT') {
          log('session_version_conflict', { sessionId, stepId });
          const replay = deps.sessionStore.getIdempotentStepResult({
            sessionId,
            stepId,
            requestId,
          });
          if (replay) return replay;
        }
        return yield* Effect.fail(err);
      }

      log('step_completed', {
        sessionId,
        stepId,
        requestId,
        score: scoreBreakdown.score,
        sessionComplete: completed,
      });

      return apiResponse;
    });

  async function runSubjectStep(
    sessionId: string,
    stepId: string,
    requestId: string,
  ): Promise<SubmitAnswerResponse> {
    return throwEither(
      await Effect.runPromise(Effect.either(runSubjectStepEffect(sessionId, stepId, requestId))),
    );
  }

  const getSessionProjectionEffect = (sessionId: string) =>
    Effect.gen(function* () {
      const session = deps.sessionStore.getSession(sessionId);
      if (!session) {
        return yield* Effect.fail(new SessionNotFound({ message: 'Session not found' }));
      }

      const scenario = yield* loadScenarioEffect(deps.scenarioLibrary, session.runManifest.scenarioId);
      const { snapshot, runManifest, version } = session;
      const currentStep =
        snapshot.fsmState === 'completed'
          ? null
          : (scenario.steps[snapshot.currentStepIndex] ?? null);

      const sessionScoreAggregate =
        snapshot.fsmState === 'completed' && snapshot.transcript.length > 0
          ? aggregateSessionStepScores(snapshot.transcript)
          : null;

      return {
        sessionId: session.id,
        version,
        fsmState: snapshot.fsmState,
        currentStep: currentStep ? { id: currentStep.id, prompt: currentStep.prompt } : null,
        runManifest,
        transcript: snapshot.transcript,
        sessionScoreAggregate,
      };
    });

  function getSessionProjection(sessionId: string) {
    return throwEither(Effect.runSync(Effect.either(getSessionProjectionEffect(sessionId))));
  }

  return {
    startSession,
    runSubjectStep,
    getSessionProjection,
  };
}

export type SessionOrchestrator = ReturnType<typeof createSessionOrchestrator>;
