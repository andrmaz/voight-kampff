# ADR-001: Define module boundaries and communication rules (Service-Based Modular Monolith)

**Status:** accepted

**Date:** 2026-03-22

## Context

Voight-Kampff is an interactive AI/ML evaluation tool with top drivers of Performance (5), Security (5), and Reliability (4). The core workflow (Session Orchestrator → Scenario Library/Run Configuration → Model Connector → Scoring Engine) must respond quickly while ensuring strong access control and auditability. We also need reproducible reruns via immutable run manifests and stored artifacts. If internal modules communicate without clear boundaries (shared database tables, circular dependencies, or ad-hoc synchronous calls), the system will drift into a tightly coupled “big ball of mud,” making it harder to maintain performance, enforce security controls consistently, and evolve scoring/scenario logic safely.

## Decision

Adopt a Service-Based (Modular Monolith) architecture with explicit module boundaries aligned to the logical components (Experience/API, Core session orchestration, Scoring, Scenario/Run Configuration, Integration/Model Connector, Security/Audit, Data access). Enforce communication rules:
- Modules expose functionality only through well-defined interfaces (in-process APIs) and do not access other modules’ persistence directly.
- All external access goes through the API Gateway; Auth & RBAC is enforced at the boundary and propagated as an identity/context object to downstream modules.
- Prefer synchronous in-process calls for the interactive request path; use asynchronous domain events internally only for non-blocking side effects (audit logging, artifact export, metrics), ensuring the UI path remains low-latency.
- Define dependency direction: Experience → Core → (Integration/Data/Security) with no upward calls; prohibit cyclic dependencies.
- Centralize cross-cutting concerns (authorization checks, auditing hooks, retry/timeouts for Model Connector) via shared libraries or interceptors, not by duplicating logic across modules.

## Consequences

Positive:
- Preserves low-latency interactive performance by avoiding network hops while keeping boundaries clear.
- Improves security and auditability by funneling requests through consistent auth/audit mechanisms.
- Increases reliability and reproducibility by preventing “hidden” coupling (e.g., direct DB table access) that can break reruns or state recovery.
- Enables future extraction: modules can later be split into microservices (e.g., Model Connector, Scoring) with minimal redesign.

Negative / Trade-offs:
- Requires discipline and tooling (lint rules, dependency tests, code owners) to enforce boundaries in a single repo.
- Some changes may feel slower initially (must evolve interfaces instead of quick cross-module calls).
- Introducing async events for side effects adds eventual consistency considerations (e.g., audit/event delivery guarantees) that must be handled carefully.
