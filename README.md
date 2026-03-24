# Voight-Kampff

A **Voight-Kampff style** flow where a **subject** model answers each stimulus in character (first person). The app call a **versioned, deterministic scoring pipeline** turns the subject’s text into **documented feature signals and a weighted composite** (0–100). Those numbers are **heuristic markers for human interpretation**, not evidence of sentience or consciousness. Scores are persisted with each transcript row; the **run manifest** records `scoringRubricId` and `scoringRubricVersion` so runs stay comparable. Built-in **mock** applies when no live subject keys are set.

Stack: **Node.js**, **TypeScript**, **Fastify**, **better-sqlite3**, **Effect** (orchestrator error flow), **dotenv** (loads `.env` before config). See [`src/env.d.ts`](src/env.d.ts) for typed environment variable names.

## Prerequisites

- Node.js 20+ (recommended; uses `fetch`, ESM, and modern TS targets)
- npm

## Configuration

Copy [`.env.example`](.env.example) to `.env` in the **project root** (same directory you run `npm start` / `npm run dev` from). On startup, [`src/server.ts`](src/server.ts) loads it via [`dotenv`](https://github.com/motdotla/dotenv) **before** reading configuration. Variables that are **already set** in the process environment are **not** overwritten (so Docker, systemd, or CI can still inject config).

If you prefer not to use a file, omit `.env` and export variables yourself, or use **direnv** / your IDE to set the environment.

### Required variables

| Variable         | Description                                                                                               |
| ---------------- | --------------------------------------------------------------------------------------------------------- |
| `PORT`           | HTTP listen port (validated at startup in [`src/config/env.ts`](src/config/env.ts)).                      |
| `VOIGHT_DB_PATH` | Path to the SQLite database file (e.g. `./data/voight.db`). Parent directories are created when possible. |

### Optional: session API token

| Variable           | Description                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VOIGHT_API_TOKEN` | If set, every request to a path starting with `/sessions` must include `Authorization: Bearer <same value>`. If unset or empty, session routes are not gated by this check. |

The evaluator UI at `/` has a field for this token when the server requires it.

### Optional: live subject LLM (OpenAI-compatible gateways)

Resolution lives in [`src/modules/model-connector/model-connector.ts`](src/modules/model-connector/model-connector.ts). When **`LLM_BASE_URL` / `SUBJECT_LLM_BASE_URL`** points at **openrouter.ai** (`https://openrouter.ai/api/v1`), the server uses the official **[`@openrouter/sdk`](https://www.npmjs.com/package/@openrouter/sdk)** `chat.send` path (timeouts + typed errors). Any other OpenAI-compatible base URL still uses a small **`fetch`** client with the same JSON shape.

**Subject (interviewee)**

- If **`SUBJECT_LLM_API_KEY`** is set → **`SUBJECT_LLM_BASE_URL`** and **`SUBJECT_LLM_MODEL`** are required (plus optional `SUBJECT_LLM_HTTP_REFERER` / `SUBJECT_LLM_APP_TITLE`).
- Else if **`LLM_API_KEY`** is set → **`LLM_BASE_URL`** and **`LLM_MODEL`** are required (optional `LLM_HTTP_REFERER` / `LLM_APP_TITLE`).
- Else → built-in **mock** subject.

Run manifests record `subjectModelConnectorId`, `scoringRubricId`, and `scoringRubricVersion`. Pipeline implementation: [`src/modules/scoring-engine/`](src/modules/scoring-engine/).

Defaults are **not** embedded in application code; use `.env.example` as the reference for sample values. OpenRouter’s quickstart: [openrouter.ai/docs/quickstart](https://openrouter.ai/docs/quickstart).

**Note:** If you already have a SQLite DB from an older build, stored `run_manifest` JSON may not include `scoringRubricId` / `scoringRubricVersion`. Prefer a fresh DB or new sessions when comparing manifests across versions.

## Install, build, and run

```bash
npm install
npm run build
npm start
```

For development (runs TypeScript directly with reload):

```bash
npm run dev
```

Health check:

```bash
curl -s "http://localhost:${PORT:-3000}/api/health"
```

Expect `{"ok":true}` (set `PORT` in your shell if it is not `3000`).

## Using the web UI

1. Open `http://localhost:<PORT>/`.
2. If `VOIGHT_API_TOKEN` is configured, paste the same value into **API bearer token**.
3. **Start session** → for each step, click **Run step** (one subject completion per step).
4. Per step you see composite score, rationale, feature breakdown, interpretation note, and subject excerpt. When the scenario completes, the last **POST** response includes **`sessionAggregate`** (mean, range, variance notes). **Refresh session** on a completed run loads **`sessionScoreAggregate`** from **`GET /sessions/:id`** (same information, different field name on the projection).

## HTTP API

All session routes are under `/sessions`. With `VOIGHT_API_TOKEN` set, clients must send:

```http
Authorization: Bearer <VOIGHT_API_TOKEN>
```

### Routes

| Method | Path                                         | Description                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------ | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST` | `/sessions/start`                            | Body optional: `{ "scenarioId": "vk-baseline" }`. If set, must equal the scenario’s **`id`** in the loaded JSON (default loads `content/scenarios/v1.json`, whose `id` is `vk-baseline`). **201** response with `sessionId`, `runManifestId`, `firstStep`.                                                                                                                                                               |
| `POST` | `/sessions/:sessionId/steps/:stepId/respond` | Body: `{ "requestId": string }`. One subject completion per step. `requestId` must be unique per attempt (same id replays without additional LLM calls). Response includes `scoreBreakdown` (with `features`, `interpretationNote`, `rubricId` / `rubricVersion`), `subjectReplyExcerpt`, `modelExcerpt`, `sessionComplete`, and `sessionAggregate` (`null` until the final step completes the session, then populated). |
| `GET`  | `/sessions/:sessionId`                       | Session projection: FSM state, current step, transcript, run manifest; when `fsmState` is `completed`, **`sessionScoreAggregate`** summarizes step scores (same role as `sessionAggregate` on the last POST).                                                                                                                                                                                                            |
| `GET`  | `/api/health`                                | Liveness.                                                                                                                                                                                                                                                                                                                                                                                                                |
| `GET`  | `/`                                          | Static evaluator UI.                                                                                                                                                                                                                                                                                                                                                                                                     |

Error bodies are JSON with `error` and `message` where applicable (see [`src/api/error-map.ts`](src/api/error-map.ts)).

### Example (`curl`)

```bash
# Start (add -H "Authorization: Bearer …" if VOIGHT_API_TOKEN is set)
curl -sS -X POST "http://localhost:3000/sessions/start" \
  -H "Content-Type: application/json" \
  -d '{}'

# Invoke subject model for step (new UUID per attempt)
curl -sS -X POST "http://localhost:3000/sessions/$SESSION_ID/steps/$STEP_ID/respond" \
  -H "Content-Type: application/json" \
  -d "{\"requestId\":\"$(uuidgen)\"}"
```

## Tests

```bash
npm test
```

## Project layout (high level)

| Path                 | Role                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------- |
| `src/server.ts`      | Entry point: env, wiring, listen.                                                      |
| `src/api/`           | Fastify app and HTTP error mapping.                                                    |
| `src/config/env.ts`  | Server env validation.                                                                 |
| `src/domain/`        | Tagged domain errors (Effect-oriented).                                                |
| `src/modules/`       | Scenario library, session store, orchestrator, model connector, scoring, run manifest. |
| `content/scenarios/` | Scenario JSON.                                                                         |
| `public/`            | Static evaluator UI (`index.html` + inline script).                                    |
| `tests/`             | `node:test` suites (run via `tsx`; see `npm test`).                                    |
| `docs/agents/`       | Extra context for AI agents ([`AGENTS.md`](AGENTS.md) links here).                     |

## License

[MIT](LICENSE)
