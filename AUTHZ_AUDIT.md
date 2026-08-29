# Authorization Audit — OpsPilot API

**Date:** 2026-08-29  
**Auditor:** Security Shift-Left Retrofit (automated + manual review)  
**Branch:** `security/shift-left`

> This document enumerates every route in `apps/api` and tags each as
> `PROTECTED` (requires authenticated principal) or `PUBLIC` (intentionally
> open), along with the permission required and the rationale.

---

## Route Protection Summary

| Route Group | Endpoint | Method | Status | Permission Required | Notes |
|---|---|---|---|---|---|
| **Root** | `/` | GET | PUBLIC | — | API info only |
| **Health** | `/health` | GET | PUBLIC | — | Required by Railway health check |
| **Alerts** | `/api/v1/alerts` | GET | PUBLIC | — | Read-only; UI needs no login |
| | `/api/v1/alerts/:id` | GET | PUBLIC | — | Read-only |
| | `/api/v1/alerts/:id` | PATCH | **PROTECTED** | `INCIDENT_VIEW` | Status mutations require auth |
| | `/api/v1/alerts/:id/related` | GET | PUBLIC | — | Read-only |
| **Incidents** | `/api/v1/incidents` | GET | PUBLIC | — | Read-only |
| | `/api/v1/incidents/:id` | GET | PUBLIC | — | Read-only |
| | `/api/v1/incidents/:id/timeline` | GET | PUBLIC | — | Read-only |
| | `/api/v1/incidents/:id` | PATCH | **PROTECTED** | `INCIDENT_VIEW` | State mutation requires auth |
| | `/api/v1/incidents/:id/status` | PATCH | **PROTECTED** | `REMEDIATION_APPROVE` | Lifecycle FSM — SRE_OPERATOR+ |
| | `/api/v1/incidents/:id/topology` | GET | PUBLIC | — | Read-only blast-radius view |
| | `/api/v1/incidents/:id/evidence` | GET | PUBLIC | — | Read-only evidence list |
| **Events** | `/api/v1/events` | POST | **PROTECTED** | `INCIDENT_VIEW` | Prevents unauthenticated event flood |
| | `/api/v1/events` | GET | PUBLIC | — | Read-only |
| **Services** | All GETs | GET | PUBLIC | — | Service catalog read-only |
| **Analytics** | All GETs | GET | PUBLIC | — | Aggregate metrics — informational |
| **Audit** | All GETs | GET | PUBLIC | — | Audit trail read-only |
| **Rules** | `/api/v1/rules` | GET | PUBLIC | — | Read threshold rules |
| | `/api/v1/rules` | POST | **PROTECTED** | `REMEDIATION_APPROVE` | Rule creation — SRE_OPERATOR+ |
| | `/api/v1/rules/:id` | PUT | **PROTECTED** | `REMEDIATION_APPROVE` | Rule update — SRE_OPERATOR+ |
| | `/api/v1/rules/:id` | DELETE | **PROTECTED** | `REMEDIATION_APPROVE` | Rule deletion — SRE_OPERATOR+ |
| **Simulator** | `/api/v1/simulator/status` | GET | PUBLIC | — | Status read |
| | `/api/v1/simulator/scenarios` | GET | PUBLIC | — | Scenario list |
| | `/api/v1/simulator` | POST | **PROTECTED** | `REMEDIATION_EXECUTE` | Chaos — INCIDENT_COMMANDER only |
| | `/api/v1/simulator/chaos` | POST | **PROTECTED** | `REMEDIATION_EXECUTE` | Chaos — INCIDENT_COMMANDER only |
| | `/api/v1/simulator/heal` | POST | **PROTECTED** | `REMEDIATION_EXECUTE` | Heal — INCIDENT_COMMANDER only |
| | `/api/v1/simulator/deploy` | POST | **PROTECTED** | `REMEDIATION_EXECUTE` | Deploy — INCIDENT_COMMANDER only |
| **Stream (SSE)** | All GETs | GET | PUBLIC | — | Live streams; UI shows without login |
| **Telemetry** | `/api/v1/telemetry/status` | GET | PUBLIC | — | Provider status read |
| | `/api/v1/telemetry/provider` | POST | **PROTECTED** | `ADMIN_CONFIGURATION` | SECURITY_ADMIN only |
| | `/api/v1/telemetry/demo/override` | POST | **PROTECTED** | `ADMIN_CONFIGURATION` | SECURITY_ADMIN only |
| | `/api/v1/telemetry/record/start` | POST | **PROTECTED** | `ADMIN_CONFIGURATION` | SECURITY_ADMIN only |
| | `/api/v1/telemetry/record/stop` | POST | **PROTECTED** | `ADMIN_CONFIGURATION` | SECURITY_ADMIN only |
| | `/api/v1/telemetry/replay/start` | POST | **PROTECTED** | `ADMIN_CONFIGURATION` | SECURITY_ADMIN only |
| **Topology** | All GETs | GET | PUBLIC | — | Topology graph read-only |
| **Integrations** | `/api/v1/integrations` | GET | PUBLIC | — | Integration list read |
| | `/api/v1/integrations/test` | POST | PUBLIC | — | ⚠️ Accepted risk: outbound ping only |
| **AI** | `/api/v1/ai` | ALL | PUBLIC | — | ⚠️ See §8 — needs follow-on audit |
| **Governance** | All | MIXED | **PROTECTED** | `GOVERNANCE_VIEW/MANAGE` | Feature-flagged |
| **Drift** | All | MIXED | **PROTECTED** | `DRIFT_VIEW/MANAGE` | Feature-flagged |
| **AI Incidents** | All | MIXED | **PROTECTED** | `AI_INCIDENT_VIEW/MANAGE` | Feature-flagged |
| **Reporting** | All | ALL | **PROTECTED** | `REPORTING_VIEW` | Feature-flagged |
| **Predictions** | All | MIXED | **PROTECTED** | `PREDICTION_VIEW/MANAGE` | Feature-flagged |
| **Knowledge** | All | MIXED | **PROTECTED** | `KNOWLEDGE_VIEW/MANAGE` | |
| **Remediation** | All mutations | MIXED | **PROTECTED** | `REMEDIATION_APPROVE/EXECUTE` | |

---

## §8 — Open Questions / Accepted Risks

### AI Routes (`/api/v1/ai`)
No `requirePermission` guards detected. Routes wrap AI inference (could be costly if abused).
**Action required:** Inspect ai.routes.ts and add guards in a follow-on PR.

### SSE Stream Routes
Intentionally public — UI renders live activity without login. Per-connection DoS not mitigated
beyond global rate limit. Accepted for now.

### Integrations POST /test
Outbound connectivity ping only; no data mutation. Accepted as low risk.

---

## §9 — Live Curl Validation

Run after `NODE_ENV=development JWT_SECRET=<dummy> pnpm --filter=api dev`:

```bash
# 1. Simulator chaos — should be 401 (was 201 before this PR)
curl -s -X POST http://localhost:3001/api/v1/simulator/chaos \
  -H "Content-Type: application/json" \
  -d '{"type":"cpu_spike","targetServiceId":"svc-1","intensity":0.9}' | jq .
# Expected: {"success":false,"error":{"code":"AUTHENTICATION_REQUIRED",...}}

# 2. Same with dev auth header — should be 201
curl -s -X POST http://localhost:3001/api/v1/simulator/chaos \
  -H "Content-Type: application/json" \
  -H "X-Operator-Id: dev-incident-commander" \
  -d '{"type":"cpu_spike","targetServiceId":"svc-1","intensity":0.9}' | jq .
# Expected: {"success":true,"data":{...}}

# 3. Rules DELETE — should be 401
curl -s -X DELETE http://localhost:3001/api/v1/rules/any-id | jq .
# Expected: {"success":false,"error":{"code":"AUTHENTICATION_REQUIRED",...}}

# 4. Telemetry provider switch — should be 401
curl -s -X POST http://localhost:3001/api/v1/telemetry/provider \
  -H "Content-Type: application/json" \
  -d '{"provider":"mock"}' | jq .
# Expected: {"success":false,"error":{"code":"AUTHENTICATION_REQUIRED",...}}

# 5. SRE_OPERATOR cannot inject chaos (lacks REMEDIATION_EXECUTE)
curl -s -X POST http://localhost:3001/api/v1/simulator/chaos \
  -H "Content-Type: application/json" \
  -H "X-Operator-Id: dev-user-sre" \
  -d '{"type":"cpu_spike","targetServiceId":"svc-1","intensity":0.9}' | jq .
# Expected: {"success":false,"error":{"code":"INSUFFICIENT_PERMISSION",...}}
```

---

## §10 — RBAC Matrix

| Permission | VIEWER | SRE_OPERATOR | INCIDENT_COMMANDER | SECURITY_ADMIN |
|---|---|---|---|---|
| `INCIDENT_VIEW` | ✅ | ✅ | ✅ | ✅ |
| `REMEDIATION_APPROVE` | ❌ | ✅ | ✅ | ❌ |
| `REMEDIATION_EXECUTE` | ❌ | ❌ | ✅ | ❌ |
| `GOVERNANCE_MANAGE` | ❌ | ✅ | ✅ | ✅ |
| `GOVERNANCE_APPROVE` | ❌ | ❌ | ✅ | ✅ |
| `ADMIN_CONFIGURATION` | ❌ | ❌ | ❌ | ✅ |
| `DRIFT_MANAGE` | ❌ | ✅ | ✅ | ✅ |
| `AI_INCIDENT_MANAGE` | ❌ | ✅ | ✅ | ✅ |
| `PREDICTION_MANAGE` | ❌ | ✅ | ✅ | ✅ |
| `KNOWLEDGE_MANAGE` | ❌ | ✅ | ✅ | ✅ |
