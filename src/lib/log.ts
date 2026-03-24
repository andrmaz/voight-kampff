/**
 * Minimal structured logs (JSON lines). Truncates long strings — no raw secrets.
 */
export function logEvent(event: string, fields: Record<string, unknown> = {}) {
  const safe = { ...fields };
  for (const k of Object.keys(safe)) {
    const v = safe[k];
    if (typeof v === 'string' && v.length > 200) {
      safe[k] = `${v.slice(0, 200)}…[truncated,len=${v.length}]`;
    }
  }
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...safe }));
}
