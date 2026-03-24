# API & product surface

## HTTP (Fastify)

- **Prefix:** Session lifecycle under **`/sessions`** (see `src/api/app.ts`).
- **Auth:** If `VOIGHT_API_TOKEN` is set, `/sessions/*` requires `Authorization: Bearer <token>`.
- **Other:** `GET /api/health`, `GET /` serves `public/index.html`.

Details and curl examples: **README.md**.

## Static UI

- **`public/index.html`:** Dev-facing evaluator; shows step results, score breakdown, session aggregate when complete.

## Scenarios

- JSON under **`content/scenarios/`** (e.g. `v1.json`); loaded by the scenario library module. Steps carry `rubricId` used by the scoring engine (with legacy id mapping where implemented).

## Model connector

- **Env resolution:** `SUBJECT_LLM_*` overrides shared `LLM_*`; mock connector when no API key.
- **OpenRouter:** If base URL host is OpenRouter, **`@openrouter/sdk`** `chat.send` is used; otherwise raw **`fetch`** to `{baseUrl}/chat/completions`.
- **Attribution headers:** Optional referer / title env vars—see `.env.example` and README.
