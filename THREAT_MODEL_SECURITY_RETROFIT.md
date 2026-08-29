# OpsPilot AI — Threat Model & Security Retrofit Specification

**Date:** 2026-08-29  
**Status:** Active Baseline  
**Scope:** `apps/api`, `.github/workflows/ci.yml`, rate limiting, authorization enforcement  

---

## 1. Executive Summary & Attack Surface Assessment

This threat model establishes the baseline security posture for OpsPilot AI prior to Sim 2.1 Phase 3. 

### 1.1 Attack Surface Breakdown (Code-Verified Fact)
- **Registered Route Plugins:** 21 plugins registered in `apps/api/src/app.ts`
- **Total Endpoints:** 98 distinct route handlers across 21 `*.routes.ts` files
- **Authentication Mechanism:** Bearer JWT (HS256) evaluated in `apps/api/src/modules/auth/auth.middleware.ts` with dev/demo fallback via `X-Operator-Id` header
- **RBAC Roles:** `VIEWER`, `SRE_OPERATOR`, `INCIDENT_COMMANDER`, `SECURITY_ADMIN`

### 1.2 Out of Scope
- **OIDC Migration:** Deferred (standing architectural decision)
- **Platform Infrastructure Migration:** Railway deployment remains standard; Render migration deferred
- **MCP Protocol Integrations:** Out of scope

---

## 2. Threat Analysis & Risk Register

| Risk ID | Severity | Category | Threat Description | Affected Surface | Mitigation / Status |
|---|---|---|---|---|---|
| **R-01** | **P0** | Auth Bypass / Abuse | Chaos injection endpoints open to unauthenticated callers | `POST /api/v1/simulator/chaos`, `/deploy`, `/heal` | Guarded with `requirePermission('REMEDIATION_EXECUTE')` |
| **R-02** | **P0** | Unintended Data Mutation | Rule creation/update/deletion open without role check | `POST/PUT/DELETE /api/v1/rules` | Guarded with `requirePermission('REMEDIATION_APPROVE')` |
| **R-03** | **P1** | Pipeline Tampering | Telemetry provider switching & recording controls open to anyone | `POST /api/v1/telemetry/*` | Guarded with `requirePermission('ADMIN_CONFIGURATION')` |
| **R-04** | **P1** | State Spoofing | Incident status transitions & alert acknowledgments unauthenticated | `PATCH /api/v1/incidents/*`, `PATCH /api/v1/alerts/*` | Guarded with `INCIDENT_VIEW` & `REMEDIATION_APPROVE` |
| **R-05** | **P1** | Privilege Escalation | `ENABLE_DEMO_AUTH=true` accidentally enabled in production | `auth.middleware.ts` | Process crashes on startup if `ENABLE_DEMO_AUTH=true` && `NODE_ENV=production` |
| **R-06** | **P2** | Resource Exhaustion / DoS | Unthrottled API endpoints vulnerable to request flooding | Global API | Global rate limit lowered to 200 req/min; Simulator POSTs capped at 30 req/min per IP |
| **R-07** | **P2** | Credential Exposure | Accidental hardcoded secrets or JWT secret leakage in repo history | Git repository | Added `gitleaks` step & `.gitleaks.toml` allowlist in CI |
| **R-08** | **P2** | Vulnerable Dependencies | High/Critical CVEs in transitive npm packages | `pnpm-lock.yaml` | Added `pnpm audit --audit-level=high` step to `ci.yml` |
| **R-09** | **P3** | Event Ingest Spoofing | Unauthenticated event ingestion flooding event buffer | `POST /api/v1/events` | Guarded with `requirePermission('INCIDENT_VIEW')` |
| **R-10** | **P3** | Outbound Ping Abuse | Webhook test endpoint triggering outbound requests | `POST /api/v1/integrations/test` | Accepted risk (low impact, no data mutation) |

---

## 3. Trust Boundaries & Role Hierarchy

```
[ Unauthenticated Public User ]
             │
             ▼  (GET /health, GET /alerts, GET /incidents, GET /services, GET /topology)
┌─────────────────────────────────────────────────────────────────┐
│ READ-ONLY PUBLIC VIEWS (Dashboards, Metrics, Info, SSE Streams) │
└─────────────────────────────────────────────────────────────────┘

[ Authenticated Principal (JWT or Dev Fallback Header) ]
             │
             ├─ Role: VIEWER
             │    └── Permissions: INCIDENT_VIEW, REMEDIATION_VIEW, GOVERNANCE_VIEW, DRIFT_VIEW, etc.
             │
             ├─ Role: SRE_OPERATOR
             │    └── Permissions: + REMEDIATION_APPROVE, GOVERNANCE_MANAGE, DRIFT_MANAGE, KNOWLEDGE_MANAGE
             │
             ├─ Role: INCIDENT_COMMANDER
             │    └── Permissions: + REMEDIATION_EXECUTE, GOVERNANCE_APPROVE
             │
             └─ Role: SECURITY_ADMIN
                  └── Permissions: + ADMIN_CONFIGURATION
```

---

## 4. Complete 98-Route Inventory vs. Protection Policy

Cross-checked against `apps/api/src/app.ts` (21 plugin registrations):

| # | Plugin Module | Path | Method | Auth Required | Permission Required | Threat Addressed |
|---|---|---|---|---|---|---|
| 1 | Health | `/health` | GET | PUBLIC | — | Infrastructure health check |
| 2-3 | Events | `/api/v1/events` | GET, POST | MIXED | POST: `INCIDENT_VIEW` | R-09 |
| 4-7 | Alerts | `/api/v1/alerts` (4 routes) | GET, PATCH | MIXED | PATCH: `INCIDENT_VIEW` | R-04 |
| 8-14 | Incidents | `/api/v1/incidents` (7 routes) | GET, PATCH | MIXED | PATCH: `INCIDENT_VIEW`, PATCH `/status`: `REMEDIATION_APPROVE` | R-04 |
| 15-19 | Services | `/api/v1/services` (5 routes) | GET | PUBLIC | — | Public catalog |
| 20-25 | Simulator | `/api/v1/simulator` (6 routes) | GET, POST | MIXED | POSTs: `REMEDIATION_EXECUTE` | R-01 |
| 26-28 | Analytics | `/api/v1/analytics` (3 routes) | GET | PUBLIC | — | Public analytics |
| 29-30 | Audit | `/api/v1/audit` (2 routes) | GET | PUBLIC | — | Audit trail read |
| 31-33 | Stream | `/api/v1/stream` (3 routes) | GET | PUBLIC | — | SSE streams |
| 34-41 | AI | `/api/v1/ai` (8 routes) | ALL | PUBLIC | Follow-on audit required | AI inference |
| 42-52 | Remediation | `/api/v1/remediation` (11 routes) | MIXED | PROTECTED | `REMEDIATION_APPROVE` / `EXECUTE` | Control plane |
| 53-54 | Integrations | `/api/v1/integrations` (2 routes) | GET, POST | PUBLIC | — | R-10 (Accepted risk) |
| 55-60 | Telemetry | `/api/v1/telemetry` (6 routes) | GET, POST | MIXED | POSTs: `ADMIN_CONFIGURATION` | R-03 |
| 61-64 | Rules | `/api/v1/rules` (4 routes) | GET, POST, PUT, DELETE | MIXED | Mutations: `REMEDIATION_APPROVE` | R-02 |
| 65-66 | Topology | `/api/v1/topology` (2 routes) | GET | PUBLIC | — | Network graph |
| 67-74 | Governance | `/api/v1/governance` (8 routes) | GET, POST, PATCH | PROTECTED | `GOVERNANCE_VIEW` / `MANAGE` | Feature-flagged |
| 75-80 | Drift | `/api/v1/drift` (6 routes) | GET, POST | PROTECTED | `DRIFT_VIEW` / `MANAGE` | Feature-flagged |
| 81-85 | AI Incidents | `/api/v1/ai-incidents` (5 routes) | GET, POST, PATCH | PROTECTED | `AI_INCIDENT_VIEW` / `MANAGE` | Feature-flagged |
| 86-88 | Reporting | `/api/v1/reports` (3 routes) | GET | PROTECTED | `REPORTING_VIEW` | Feature-flagged |
| 89-94 | Predictions | `/api/v1/predictions` (6 routes) | GET, POST | PROTECTED | `PREDICTION_VIEW` / `MANAGE` | Predictive engine |
| 95-98 | Knowledge | `/api/v1/knowledge` (4 routes) | GET, POST | PROTECTED | `KNOWLEDGE_VIEW` / `MANAGE` | Knowledge RAG |

**Total Count Verification:** 1 + 2 + 4 + 7 + 5 + 6 + 3 + 2 + 3 + 8 + 11 + 2 + 6 + 4 + 2 + 8 + 6 + 5 + 3 + 6 + 4 = **98 routes**.
Matched exactly against 21 registered Fastify plugins.

---

## 5. Security Scanning Strategy

### 5.1 Dependency Vulnerability Audit (`pnpm audit`)
- **Policy:** First-run report-only (`|| true`).
- **Reasoning:** 15 baseline vulnerabilities found (1 critical, 5 high in transitive dev/test dependencies like `vitest`/`vite` and `find-my-way`). Hard-failing immediately would block valid feature PRs before dependency upgrades are scheduled. Upgrades will be submitted in a targeted follow-on PR, after which `|| true` will be removed.

### 5.2 Secrets Scanning (`gitleaks`)
- **Policy:** Incremental scanning enabled via `gitleaks-action@v2`.
- **Allowlist Policy:** Allowlist rules defined in `.gitleaks.toml` for documented CI-only dummy tokens (`ci-only-dummy-jwt-secret-not-used-in-production-min-32-chars` in `ci.yml` and `vitest.config.ts`).

---

## 6. Rate Limiting Specification

- **Global Rate Limit:** 200 requests / 1 minute per IP (reduced from 500/min).
  - *Reasoning:* Protects Fastify process from general request floods while easily accommodating single-page app poll rates.
- **Simulator Mutations Rate Limit:** 30 requests / 1 minute per IP (applied via `CHAOS_RATE_LIMIT` route config on POST `/chaos`, `/deploy`, `/heal`).
  - *Reasoning:* Prevents rapid automated chaos injection loops from exhausting CPU/memory or spamming database state.
