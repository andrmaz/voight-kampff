# Architecture & layout

## Stack (concise)

- **Runtime:** Node.js, ESM (`"type": "module"`).
- **HTTP:** Fastify; CORS enabled; session routes optionally gated by bearer token.
- **Data:** `better-sqlite3` for sessions, events, idempotent step results.
- **Orchestration errors:** `Effect` + tagged domain errors in `src/domain/`, mapped to HTTP in `src/api/error-map.ts`.
- **LLM:** `src/modules/model-connector/`—OpenRouter SDK when base URL is `openrouter.ai`, otherwise `fetch` to OpenAI-compatible `/chat/completions`.

## Product flow

- **Subject only:** No second “analyst” LLM. Each step: build subject prompt → invoke model → deterministic `scoreStep` → append transcript → optional session aggregate on completion.
- **Scoring:** `src/modules/scoring-engine/` (extractors, weighted pipeline, rubric id/version on `ScoreBreakdown` and run manifest).
- **Run manifest:** Records scenario ids, subject connector id, `scoringRubricId` / `scoringRubricVersion` (see `src/modules/run-configuration/`).

## Entrypoint

- **`src/server.ts`:** Loads `dotenv/config` first, reads `PORT` / `VOIGHT_DB_PATH` / optional `VOIGHT_API_TOKEN`, wires store + scenario library + model connector + orchestrator, calls `buildApp`, listens.
- **Fastify assembly:** `buildApp` lives in **`src/api/app.ts`** (imports use `.js` extensions per NodeNext; on disk that file is `app.ts`).

### Doc choice (open)

Two accurate ways to describe the same thing—pick one for future edits:

1. **Import-path style:** “Server imports `./api/app.js` from `server.ts`.”
2. **Editor-path style:** “HTTP app is defined in `src/api/app.ts`.”

They do not conflict with behavior; they differ only in what you optimize for (tsc vs human file search).

## Directory map (high signal)

| Path | Role |
|------|------|
| `src/api/` | Fastify app, error mapping |
| `src/config/` | Server env validation |
| `src/domain/` | Tagged errors |
| `src/lib/` | Shared helpers (e.g. paths, logging) |
| `src/modules/scenario-library/` | Scenario JSON loading |
| `src/modules/session-store/` | SQLite session persistence |
| `src/modules/session-orchestrator/` | FSM, idempotency, scoring invocation |
| `src/modules/model-connector/` | Subject LLM invoke + env resolution |
| `src/modules/scoring-engine/` | Rubric pipeline + session aggregates |
| `src/modules/run-configuration/` | Run manifest shape |
| `content/scenarios/` | Scenario definitions |
| `public/` | Static evaluator UI |
| `tests/` | `node:test` suites (run through `tsx`) |
