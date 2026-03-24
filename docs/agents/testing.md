# Testing

## Runner & command

- **`npm test`** → `tsx --test tests/*.test.ts` (Node.js built-in **`node:test`** + **`assert/strict`**).
- Tests import compiled-style paths from **`../src/.../*.js`** to mirror runtime ESM resolution.

## Current focus

- **`tests/orchestrator-idempotency.test.ts`:** Session step idempotency (`requestId`), multi-step progression, session aggregate on completion—uses in-memory SQLite and injected `invokeImpl` on the model connector.

## Gaps / conventions

- No coverage tooling or snapshot suite in repo—extend by adding `tests/*.test.ts` and keeping imports consistent with existing files.
