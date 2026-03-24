# Logical Components

## Experience

### UI / Evaluator Console

**Responsibility:** Interactive web UI to run sessions, view live results, and review transcripts.

**Dependencies:** API Gateway

### API Gateway

**Responsibility:** Single entry point; request routing; rate limiting; auth enforcement; API versioning.

**Dependencies:** Auth & RBAC, Session Orchestrator

## Core

### Session Orchestrator

**Responsibility:** Creates/starts/stops evaluation sessions; controls session state machine; coordinates question flow and timing.

**Dependencies:** Auth & RBAC, Scenario Library, Model Connector, Scoring Engine, Run Configuration, Session Store, Artifact Store

### Scenario Library

**Responsibility:** Stores Voight-Kampff question sets, branching logic, rubrics, and versions.

**Dependencies:** Content Store

### Run Configuration

**Responsibility:** Captures immutable “run manifest”: scenario version, model/provider, parameters, seeds, scoring version, environment metadata; supports rerun from manifest.

**Dependencies:** Scenario Library, Model Connector, Scoring Engine, Session Store

### Scoring Engine

**Responsibility:** Computes per-question and overall scores; applies rubric; produces explainable breakdown; versioned scoring logic for comparisons.

**Dependencies:** Session Store, Model Connector

## Integration

### Model Connector

**Responsibility:** Invokes the AI/agent under test; normalizes responses; handles timeouts/retries; supports multiple providers; records provider/model identifiers.

**Dependencies:** Secrets Manager, External Model Providers

## Data

### Session Store

**Responsibility:** Persists session state, transcripts, timestamps, and intermediate results for reliability/restart and later comparison.

**Dependencies:** Primary Database

### Artifact Store

**Responsibility:** Stores immutable artifacts: transcripts, prompts, run manifests, score reports, exported bundles for audit/replay.

**Dependencies:** Object Storage

## Security

### Auth & RBAC

**Responsibility:** Authentication (SSO/local) and authorization (roles: evaluator, admin, auditor).

**Dependencies:** Identity Provider

### Audit Log

**Responsibility:** Immutable record of access, changes, and evaluation events for security and traceability.

**Dependencies:** Audit Store

### Secrets Manager

**Responsibility:** Stores API keys/tokens for model providers securely; rotation policies.

## Platform

### Observability

**Responsibility:** Metrics/tracing/logging; latency SLOs; error tracking for performance & reliability.

**Dependencies:** Logging/Tracing Backend

