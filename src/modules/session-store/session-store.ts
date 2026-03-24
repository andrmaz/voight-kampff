import Database from 'better-sqlite3';
import { SessionNotFound, VersionConflict } from '../../domain/domain-error.js';
import type { RunManifest } from '../run-configuration/run-configuration.js';
import type { ScoreBreakdown, SessionScoreAggregate } from '../scoring-engine/scoring-engine.js';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL DEFAULT 0,
  snapshot TEXT NOT NULL,
  run_manifest TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS idempotent_step_results (
  session_id TEXT NOT NULL,
  step_id TEXT NOT NULL,
  request_id TEXT NOT NULL,
  response_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (session_id, step_id, request_id)
);

CREATE INDEX IF NOT EXISTS idx_session_events_session ON session_events(session_id);
`;

interface SessionRow {
  id: string;
  version: number;
  snapshot: string;
  run_manifest: string;
  created_at: string;
  updated_at: string;
}

interface IdempotentRow {
  response_json: string;
}

export interface SessionRecord {
  id: string;
  version: number;
  snapshot: SessionSnapshot;
  runManifest: RunManifest;
  createdAt: string;
  updatedAt: string;
}

/** Stored session FSM + transcript (parsed from DB JSON). */
export interface SessionSnapshot {
  fsmState: 'awaiting_answer' | 'completed';
  currentStepIndex: number;
  transcript: TranscriptEntry[];
}

/** One completed step: subject utterance (`answer`); `modelText` reserved (empty — no second LLM pass). */
export interface TranscriptEntry {
  stepId: string;
  answer: string;
  modelText: string;
  scoreBreakdown: ScoreBreakdown;
  providerMeta: Record<string, unknown>;
}

export interface CommitStepMutationParams {
  sessionId: string;
  appendEvents: Array<{ type: string; payload: Record<string, unknown> }>;
  newSnapshot: SessionSnapshot;
  idempotent?: { stepId: string; requestId: string; response: SubmitAnswerResponse };
}

/** API body persisted for idempotent replays and returned from `runSubjectStep`. */
export interface SubmitAnswerResponse {
  scoreBreakdown: ScoreBreakdown;
  /** Subject model reply (truncated). */
  subjectReplyExcerpt: string;
  /** Same as `subjectReplyExcerpt` (compat for older clients). */
  modelExcerpt: string;
  nextStep: { id: string; prompt: string } | null;
  sessionComplete: boolean;
  /** Populated when `sessionComplete` — aggregate of step scores under the session rubric. */
  sessionAggregate: SessionScoreAggregate | null;
}

type SqliteDatabase = InstanceType<typeof Database>;

export interface SessionStore {
  db: SqliteDatabase;
  createSession(p: { id: string; snapshot: SessionSnapshot; runManifest: RunManifest; version?: number }): void;
  getSession(sessionId: string): SessionRecord | null;
  updateSnapshotOptimistic(p: {
    sessionId: string;
    expectedVersion: number;
    snapshot: SessionSnapshot;
  }): { ok: false; conflict: true } | { ok: true; version: number };
  appendEvent(p: { sessionId: string; type: string; payload: Record<string, unknown> }): void;
  getIdempotentStepResult(p: { sessionId: string; stepId: string; requestId: string }): SubmitAnswerResponse | null;
  saveIdempotentStepResult(p: {
    sessionId: string;
    stepId: string;
    requestId: string;
    response: SubmitAnswerResponse;
  }): void;
  commitStepMutation(p: CommitStepMutationParams): void;
}

export function createSessionStore(opts: { dbPath: string }): SessionStore {
  const db = new Database(opts.dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA);

  const insertSession = db.prepare(`
    INSERT INTO sessions (id, version, snapshot, run_manifest, created_at, updated_at)
    VALUES (@id, @version, @snapshot, @run_manifest, @created_at, @updated_at)
  `);

  const selectSession = db.prepare(`
    SELECT id, version, snapshot, run_manifest, created_at, updated_at FROM sessions WHERE id = ?
  `);

  const updateSessionVersioned = db.prepare(`
    UPDATE sessions
    SET version = version + 1,
        snapshot = @snapshot,
        updated_at = @updated_at
    WHERE id = @id AND version = @expected_version
  `);

  const insertEvent = db.prepare(`
    INSERT INTO session_events (session_id, event_type, payload, created_at)
    VALUES (@session_id, @event_type, @payload, @created_at)
  `);

  const selectIdempotent = db.prepare(`
    SELECT response_json FROM idempotent_step_results
    WHERE session_id = ? AND step_id = ? AND request_id = ?
  `);

  const insertIdempotent = db.prepare(`
    INSERT OR REPLACE INTO idempotent_step_results (session_id, step_id, request_id, response_json, created_at)
    VALUES (@session_id, @step_id, @request_id, @response_json, @created_at)
  `);

  const txn = db.transaction((p: CommitStepMutationParams) => {
    const row = selectSession.get(p.sessionId) as SessionRow | undefined;
    if (!row) {
      throw new SessionNotFound({ message: 'Session not found' });
    }
    const expectedVersion = row.version;
    const now = new Date().toISOString();
    for (const e of p.appendEvents) {
      insertEvent.run({
        session_id: p.sessionId,
        event_type: e.type,
        payload: JSON.stringify(e.payload),
        created_at: now,
      });
    }
    const info = updateSessionVersioned.run({
      id: p.sessionId,
      expected_version: expectedVersion,
      snapshot: JSON.stringify(p.newSnapshot),
      updated_at: now,
    });
    if (info.changes === 0) {
      throw new VersionConflict({ message: 'Optimistic concurrency conflict' });
    }
    if (p.idempotent) {
      insertIdempotent.run({
        session_id: p.sessionId,
        step_id: p.idempotent.stepId,
        request_id: p.idempotent.requestId,
        response_json: JSON.stringify(p.idempotent.response),
        created_at: now,
      });
    }
  });

  return {
    db,

    createSession(p: { id: string; snapshot: SessionSnapshot; runManifest: RunManifest; version?: number }) {
      const now = new Date().toISOString();
      insertSession.run({
        id: p.id,
        version: p.version ?? 0,
        snapshot: JSON.stringify(p.snapshot),
        run_manifest: JSON.stringify(p.runManifest),
        created_at: now,
        updated_at: now,
      });
    },

    getSession(sessionId: string): SessionRecord | null {
      const row = selectSession.get(sessionId) as SessionRow | undefined;
      if (!row) return null;
      return {
        id: row.id,
        version: row.version,
        snapshot: JSON.parse(row.snapshot) as SessionSnapshot,
        runManifest: JSON.parse(row.run_manifest) as RunManifest,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    updateSnapshotOptimistic(p: { sessionId: string; expectedVersion: number; snapshot: SessionSnapshot }) {
      const now = new Date().toISOString();
      const info = updateSessionVersioned.run({
        id: p.sessionId,
        expected_version: p.expectedVersion,
        snapshot: JSON.stringify(p.snapshot),
        updated_at: now,
      });
      if (info.changes === 0) {
        return { ok: false as const, conflict: true as const };
      }
      const next = selectSession.get(p.sessionId) as SessionRow | undefined;
      if (!next) {
        throw new Error('Session missing after optimistic update');
      }
      return { ok: true as const, version: next.version };
    },

    appendEvent(p: { sessionId: string; type: string; payload: Record<string, unknown> }) {
      insertEvent.run({
        session_id: p.sessionId,
        event_type: p.type,
        payload: JSON.stringify(p.payload),
        created_at: new Date().toISOString(),
      });
    },

    getIdempotentStepResult(p: { sessionId: string; stepId: string; requestId: string }) {
      const row = selectIdempotent.get(p.sessionId, p.stepId, p.requestId) as IdempotentRow | undefined;
      if (!row) return null;
      return JSON.parse(row.response_json) as SubmitAnswerResponse;
    },

    saveIdempotentStepResult(p: {
      sessionId: string;
      stepId: string;
      requestId: string;
      response: SubmitAnswerResponse;
    }) {
      insertIdempotent.run({
        session_id: p.sessionId,
        step_id: p.stepId,
        request_id: p.requestId,
        response_json: JSON.stringify(p.response),
        created_at: new Date().toISOString(),
      });
    },

    commitStepMutation(p: CommitStepMutationParams) {
      txn(p);
    },
  };
}
