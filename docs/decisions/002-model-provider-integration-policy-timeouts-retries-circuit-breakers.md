# ADR-002: Model provider integration policy (timeouts, retries, circuit breakers)

**Status:** proposed

**Date:** 2026-03-22

## Context

Voight-Kampff runs interactive evaluation sessions where the Session Orchestrator calls external model providers via the Model Connector. The system’s top drivers are Performance (low latency for human-in-the-loop evaluations), Security (protect provider credentials and sensitive prompts/transcripts), and Reliability (graceful failure, consistent session outcomes). External providers can be slow, rate-limited, intermittently unavailable, or return non-deterministic/partial responses. Without a consistent integration policy, the UI experience becomes unpredictable, failures cascade (e.g., thread pool exhaustion), and reruns become hard to reproduce/compare.

## Decision

Standardize all model calls behind the Model Connector with an explicit integration contract:
- Timeouts: enforce strict per-request timeouts (connect + read), with separate budgets for interactive vs. background operations.
- Retries: retry only on clearly transient failures (e.g., network timeouts, 429/5xx) with exponential backoff + jitter; cap total retry time to stay within the session latency budget.
- Circuit breaker + bulkheads: use circuit breakers per provider/model and isolate resources (thread pools/queues) so one degraded provider does not impact the whole system.
- Idempotency + request identity: attach a unique requestId to every model invocation; if the provider supports idempotency keys, supply them. Persist request metadata in the Run Manifest for reproducibility.
- Degradation behavior: on failure, return a typed error to Session Orchestrator with a clear user-facing status (e.g., “provider unavailable”), and optionally allow a manual ‘retry’ action in the UI.
- Rate limiting: enforce client-side rate limits/quotas per tenant/user to avoid provider bans and to protect system performance.
- Security: fetch provider credentials from Secrets Manager at runtime; never log secrets; redact prompts/transcripts in logs; restrict egress to approved endpoints.
- Observability: record latency, token usage/cost, error codes, and retry/circuit-breaker state; emit metrics suitable for SLOs on the interactive path.

## Consequences

Positive:
- More predictable interactive latency and fewer cascading failures, improving reliability.
- Clear, consistent user experience when providers degrade or fail.
- Easier to swap/add providers due to a single connector contract.
- Better reproducibility by capturing request identity + provider/model parameters in run manifests.
- Improved security posture via centralized secret handling and redaction.

Negative / Trade-offs:
- Added implementation complexity in the Model Connector (breaker, bulkheads, metrics).
- Retries may increase cost and tail latency if not carefully bounded.
- Some providers may not support true idempotency; partial retries can still yield non-identical outputs.
- Strict timeouts may increase visible failures; requires UX to handle and communicate them well.
