# TypeScript conventions

## Config summary (`tsconfig.json`)

- **`module` / `moduleResolution`:** `NodeNext` (Node ESM).
- **`verbatimModuleSyntax`:** `true`—use `import type` where appropriate; respect explicit type-only imports.
- **`strict`:** `true`; **`noUncheckedIndexedAccess`:** `true`.
- **Emit:** `rootDir` `src`, `outDir` `dist`, source maps + declarations.
- **Scope:** `include` is `src/**/*.ts` and `src/**/*.d.ts` only—**test files under `tests/` are not typechecked by `tsc`** unless you add them or run the IDE checker.

## Import paths

- From `src/`, use **`.js` extensions** in relative imports (e.g. `'./api/app.js'`) so NodeNext resolution matches emitted files.

## Non-standard scripts

- There is **no** `npm run typecheck` script—use **`npm run build`** as the compile/type gate.
- Production start: **`npm start`** → `node dist/server.js` (requires prior `npm run build`).
