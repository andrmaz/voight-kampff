import type { DomainError } from '../domain/domain-error.js';
import { isDomainError } from '../domain/domain-error.js';

function getLegacyErrorCode(err: unknown): unknown {
  return err && typeof err === 'object' && 'code' in err
    ? (err as { code: unknown }).code
    : undefined;
}

function mapDomainError(err: DomainError): { status: number; body: Record<string, unknown> } {
  const message = err.message;
  switch (err._tag) {
    case 'SESSION_NOT_FOUND':
      return { status: 404, body: { error: err._tag, message } };
    case 'SCENARIO_NOT_FOUND':
      return { status: 404, body: { error: err._tag, message } };
    case 'BAD_STEP':
    case 'SESSION_COMPLETED':
      return { status: 400, body: { error: err._tag, message } };
    case 'EMPTY_SCENARIO':
      return { status: 500, body: { error: err._tag, message } };
    case 'MODEL_TIMEOUT':
      return { status: 504, body: { error: err._tag, message } };
    case 'MODEL_PROVIDER_ERROR':
      return {
        status: 502,
        body: {
          error: err._tag,
          message,
          status: err.status,
          bodyPreview: err.bodyPreview,
        },
      };
    case 'VERSION_CONFLICT':
      return { status: 409, body: { error: err._tag, message } };
    case 'INTERNAL_ERROR':
      return { status: 500, body: { error: 'INTERNAL_ERROR', message } };
  }
}

export function mapErrorToHttp(err: unknown): { status: number; body: Record<string, unknown> } {
  if (isDomainError(err)) {
    return mapDomainError(err);
  }

  const code = getLegacyErrorCode(err);
  const message = err instanceof Error ? err.message : String(err);

  switch (code) {
    case 'SESSION_NOT_FOUND':
      return { status: 404, body: { error: code, message } };
    case 'SCENARIO_NOT_FOUND':
      return { status: 404, body: { error: code, message } };
    case 'BAD_STEP':
    case 'SESSION_COMPLETED':
      return { status: 400, body: { error: code, message } };
    case 'EMPTY_SCENARIO':
      return { status: 500, body: { error: code, message } };
    case 'MODEL_TIMEOUT':
      return { status: 504, body: { error: code, message } };
    case 'MODEL_PROVIDER_ERROR':
      return { status: 502, body: { error: code, message } };
    case 'VERSION_CONFLICT':
      return { status: 409, body: { error: code, message } };
    default:
      return { status: 500, body: { error: 'INTERNAL_ERROR', message } };
  }
}
