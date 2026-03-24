# ADR-003: Session state & reliability strategy (state machine + durable persistence)

**Status:** proposed

**Date:** 2026-03-22

## Context

Voight-Kampff runs interactive evaluation sessions where users expect consistent behavior and the ability to recover from failures without losing progress. Top drivers include Reliability (4) and Performance (5). Sessions coordinate multiple modules (Session Orchestrator, Model Connector, Scoring Engine) and persist data for reproducible reruns (Run Configuration + Artifact Store). Without an explicit session state model and persistence strategy, failures (process restarts, provider timeouts, partial writes) can lead to corrupted or ambiguous session outcomes, duplicated model calls, and inconsistent transcripts—undermining trust in the evaluation results.

## Decision

Model each evaluation as an explicit finite state machine owned by Session Orchestrator, with durable session state persisted in Session Store.

Rules:
- Authoritative state: Session Orchestrator is the source of truth for session lifecycle; other modules are stateless with respect to lifecycle.
- Persistence: write state transitions and append-only session events (question asked, model response received, score computed) to Session Store; persist a snapshot for fast reload.
- Idempotency: every state transition and model invocation is tagged with (sessionId, stepId, requestId) so retries (client or server) do not duplicate work.
- Consistency: prefer atomic writes per transition (event + new state version). Use optimistic concurrency (version number) to prevent concurrent updates.
- Recovery: on restart, Session Orchestrator rebuilds in-memory state from latest snapshot + events; any in-flight model calls are either reattached (if supported) or retried based on requestId policy.
- Timeouts & cancellation: support time-bounded steps; allow user-initiated cancel; ensure cancellations are persisted as terminal states.
- Read model: UI reads session progress from the authoritative state and derived projections; prevent UI from inferring state from partial artifacts.
- Side effects: emit async internal events for non-critical side effects (audit log append, artifact export, metrics) after the authoritative transition is persisted.

## Consequences

Positive:
- Clear, testable lifecycle model with fewer edge cases, improving reliability.
- Crash/restart recovery with minimal user disruption; supports resume/replay.
- Stronger reproducibility and auditability (append-only event trail).
- Better performance under load via snapshots + projections while keeping writes controlled.

Negative / Trade-offs:
- Additional implementation complexity (state machine, event log, snapshots, projections).
- Requires careful schema/versioning of events and migration strategy.
- Eventual consistency for side-effect consumers (audit/artifact export) must be handled.
- More disciplined handling of idempotency and concurrency throughout the orchestrator and UI.
