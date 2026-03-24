import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** Repository root (contains package.json, content/, public/). */
export const projectRoot = join(__dirname, '..', '..');
