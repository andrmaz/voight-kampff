export interface ServerEnv {
  port: number;
  dbPath: string;
  /** If set, `/sessions/*` require this bearer token. */
  authToken: string | undefined;
}

function requireEnv(name: keyof NodeJS.ProcessEnv): string {
  const raw = process.env[name];
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) {
    throw new Error(`Missing required environment variable: ${String(name)}`);
  }
  return value;
}

/**
 * Read and validate process env for the HTTP server.
 * @throws If `PORT` or `VOIGHT_DB_PATH` is missing or `PORT` is not a valid TCP port.
 */
export function loadServerEnv(): ServerEnv {
  const portRaw = requireEnv('PORT');
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`PORT must be an integer from 1 to 65535, got: ${portRaw}`);
  }

  const dbPath = requireEnv('VOIGHT_DB_PATH');
  const authRaw = process.env.VOIGHT_API_TOKEN;
  const authToken = typeof authRaw === 'string' && authRaw.trim() !== '' ? authRaw.trim() : undefined;

  return { port, dbPath, authToken };
}
