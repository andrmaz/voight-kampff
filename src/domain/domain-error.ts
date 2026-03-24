import { Data } from 'effect';

export class SessionNotFound extends Data.TaggedError('SESSION_NOT_FOUND')<{
  readonly message: string;
}> {}

export class ScenarioNotFound extends Data.TaggedError('SCENARIO_NOT_FOUND')<{
  readonly message: string;
}> {}

export class BadStep extends Data.TaggedError('BAD_STEP')<{
  readonly message: string;
}> {}

export class SessionCompleted extends Data.TaggedError('SESSION_COMPLETED')<{
  readonly message: string;
}> {}

export class EmptyScenario extends Data.TaggedError('EMPTY_SCENARIO')<{
  readonly message: string;
}> {}

export class ModelTimeout extends Data.TaggedError('MODEL_TIMEOUT')<{
  readonly message: string;
}> {}

export class ModelProviderError extends Data.TaggedError('MODEL_PROVIDER_ERROR')<{
  readonly message: string;
  readonly status: number;
  readonly bodyPreview: string;
}> {}

export class VersionConflict extends Data.TaggedError('VERSION_CONFLICT')<{
  readonly message: string;
}> {}

/** Unexpected failure while loading or processing (maps to HTTP 500 INTERNAL_ERROR). */
export class InternalError extends Data.TaggedError('INTERNAL_ERROR')<{
  readonly message: string;
}> {}

export type DomainError =
  | SessionNotFound
  | ScenarioNotFound
  | BadStep
  | SessionCompleted
  | EmptyScenario
  | ModelTimeout
  | ModelProviderError
  | VersionConflict
  | InternalError;

const DOMAIN_TAGS = new Set<DomainError['_tag']>([
  'SESSION_NOT_FOUND',
  'SCENARIO_NOT_FOUND',
  'BAD_STEP',
  'SESSION_COMPLETED',
  'EMPTY_SCENARIO',
  'MODEL_TIMEOUT',
  'MODEL_PROVIDER_ERROR',
  'VERSION_CONFLICT',
  'INTERNAL_ERROR',
]);

export function isDomainError(u: unknown): u is DomainError {
  if (!u || typeof u !== 'object' || !('_tag' in u)) return false;
  const tag = (u as { _tag: unknown })._tag;
  return typeof tag === 'string' && DOMAIN_TAGS.has(tag as DomainError['_tag']);
}
