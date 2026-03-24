# AGENTS

Voight-Kampff is a TypeScript Fastify monolith: one subject LLM call per scenario step, deterministic scoring, and SQLite-backed sessions.

There is **no** separate typecheck script—**`npm run build`** runs `tsc` and is the usual compile check.

| Topic | When to read |
|--------|----------------|
| [Architecture & layout](docs/agents/architecture.md) | Modules, entrypoint, scoring pipeline, persistence |
| [TypeScript conventions](docs/agents/typescript.md) | `tsconfig`, NodeNext ESM imports, what gets emitted |
| [Testing](docs/agents/testing.md) | Test runner, layout, orchestrator-focused tests |
| [API & product surface](docs/agents/api-and-product.md) | HTTP routes, static UI, scenarios, model connector |

End-user setup and curl-style API summary: [README.md](README.md).
