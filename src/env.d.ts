/**
 * Application environment variables.
 * A `.env` file in the project root is loaded by `dotenv` at server startup (see `server.ts`); values
 * already present in `process.env` take precedence. See `.env.example` for sample values.
 *
 * Every key uses `?:` because Node exposes `process.env` as `string | undefined` per key until read.
 * Which values are *required* when a given API key is set is enforced in `model-connector.ts`.
 */
declare global {
  namespace NodeJS {
    interface ProcessEnv {
      /** Required at server startup (`loadServerEnv`). Example: `3000`. */
      PORT?: string;

      /** Required at server startup (`loadServerEnv`). Example: `./data/voight.db`. */
      VOIGHT_DB_PATH?: string;

      /** If set, `/sessions/*` routes require `Authorization: Bearer <token>`. */
      VOIGHT_API_TOKEN?: string;

      /**
       * Subject model when `SUBJECT_LLM_API_KEY` is unset: shared `LLM_*` keys.
       * If `SUBJECT_LLM_API_KEY` is set, subject uses `SUBJECT_LLM_*` instead and `LLM_*` is ignored for the subject.
       */
      LLM_API_KEY?: string;
      LLM_BASE_URL?: string;
      LLM_MODEL?: string;
      LLM_HTTP_REFERER?: string;
      LLM_APP_TITLE?: string;

      /** Optional override: dedicated subject model (requires `SUBJECT_LLM_BASE_URL` and `SUBJECT_LLM_MODEL`). */
      SUBJECT_LLM_API_KEY?: string;
      SUBJECT_LLM_BASE_URL?: string;
      SUBJECT_LLM_MODEL?: string;
      SUBJECT_LLM_HTTP_REFERER?: string;
      SUBJECT_LLM_APP_TITLE?: string;
    }
  }
}

export {};
