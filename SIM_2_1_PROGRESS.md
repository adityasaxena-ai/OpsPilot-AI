# Sim 2.1 Progress & Execution Record

## Overview
This document tracks the progress, implementation, empirical verification proof, and system state for **Sim 2.1 — CI/CD Pipeline, Staging Environment, & Operational Hardening**.

---

## Step 0: Fact-Check — Production Deployment State

Prior to initiating Sim 2.1 Phase 1, an empirical audit of the live Railway production environment (`@opspilot/api`) was performed.

### Findings
1. **Deployed Codebase:**
   - Active Railway deployment: `d7d2b5ed-f657-4560-83d2-1ac4c17209ae` (SUCCESS, 2026-08-26 19:54:26 IST).
   - Built from commit `ab7acac` (CORS narrowing fix).
   - **Result:** All Sim 2.0 feature commits (`feat(governance)`, `feat(drift)`, `feat(reporting)`, `feat(remediation)`, `feat(predictions)`, `feat(rag)`) were merged prior to commit `ab7acac` and are **present in the compiled production container image**.

2. **Feature Flag Status on Railway (`@opspilot/api`):**
   - Direct Railway environment variable inspection confirmed that all `ENABLE_*` flags are **absent/unset** on Railway:
     - `ENABLE_GOVERNANCE_CONTROL_CENTER`: *unset* (evaluates `false`)
     - `ENABLE_DRIFT_MONITORING`: *unset* (evaluates `false`)
     - `ENABLE_AI_INCIDENT_MGMT`: *unset* (evaluates `false`)
     - `ENABLE_REPORTING`: *unset* (evaluates `false`)
     - `ENABLE_REMEDIATION_V2`: *unset* (evaluates `false`)
     - `ENABLE_PREDICTIVE_INTELLIGENCE`: *unset* (evaluates `false`)
     - `ENABLE_RAG`: *unset* (evaluates `false`)
   - **Conclusion:** Sim 2.0 backend code is physically present in the running container but **100% dormant** behind feature flag guards.

---

## Phase 1: CI/CD Pipeline Implementation

### Workflow Configuration (`.github/workflows/ci.yml`)
- **Triggers:** `push` (all branches) and `pull_request` (targeting `main`).
- **Toolchain:** Node.js `22` (LTS, matching engine constraint `>=22.13.0`), `pnpm` `11.20.0` (`pnpm/action-setup@v4`).
- **Service Containers:**
  - PostgreSQL 16: `postgres:16-alpine` (matching `docker-compose.yml` local container).
  - Redis 7.2: `redis:7.2-alpine` (matching `docker-compose.yml` local container).
- **Execution Pipeline:**
  1. `pnpm install --frozen-lockfile`
  2. `pnpm db:migrate` (`prisma migrate deploy` against PostgreSQL service container)
  3. `pnpm typecheck`
  4. `pnpm build` (`turbo run build`)
  5. `pnpm test` (`turbo run test` with `TURBO_FORCE: "true"` to guarantee cache bypass in CI)
- **Environment Variables & Dummy Secrets:**
  - `JWT_SECRET`: `ci-only-dummy-jwt-secret-not-used-in-production-min-32-chars` (hardcoded dummy secret used solely to satisfy Fastify/Config validation during test execution; never signs tokens in production).
  - `DATABASE_URL` / `TEST_DATABASE_URL`: `postgresql://opspilot:opspilot@localhost:5432/opspilot_test?sslmode=disable`

---

## Empirical Verification Proof (Fail-Then-Pass Pipeline Audit)

To guarantee the pipeline actively catches regressions rather than acting as a passive check, a deliberate failure test was executed on PR #1 (`ci/setup-pipeline` → `main`).

### 1. Initial CI Run (Green Baseline)
- **Branch/Commit:** `ci/setup-pipeline` (`e243524`)
- **Workflow Run ID:** `33067171443`
- **Result:** **`SUCCESS`** (All 21 job steps passed cleanly).

### 2. Deliberate Failure Test (Red Proof)
- **Breakage Applied:** Modified `apps/api/src/modules/ai/decision-engine.service.test.ts` line 50:
  ```ts
  - expect(result.incidentId).toBe('inc-dec-001');
  + expect(result.incidentId).toBe('DELIBERATE-BREAKAGE-FAILED');
  ```
- **Commit:** `d6d5868`
- **Workflow Run ID:** [`33082652097`](https://github.com/adityasaxena-ai/OpsPilot-AI/actions/runs/33082652097)
- **Result:** **`FAILURE`**
- **Step Outcome:** `Step 10: Test` failed cleanly with:
  ```text
  FAIL src/modules/ai/decision-engine.service.test.ts > Incident Decision Support Engine > decomposes overall incident risk score deterministically into 5 factors
  AssertionError: expected 'inc-dec-001' to be 'DELIBERATE-BREAKAGE-FAILED'
  ```

### 3. Clean Revert Test (Green Resolution)
- **Revert Applied:** Restored `expect(result.incidentId).toBe('inc-dec-001')`.
- **Commit:** `d411829`
- **Workflow Run ID:** [`33082850052`](https://github.com/adityasaxena-ai/OpsPilot-AI/actions/runs/33082850052)
- **Result:** **`SUCCESS`** (All 21 steps passed, job green).

---

## Phase 1 Merge & Production Verification

- **PR:** [#1 (`ci/setup-pipeline` → `main`)](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/1)
- **Merge Commit:** `463682f24e76622860824defa9e6076857f9a622`
- **Railway Deployment Impact:** Deployment `2bf21343-4c49-4ed5-91b5-033e5138dde5` status `SKIPPED` (Railway detected no change to `@opspilot/api` source under `apps/api/`).
- **Production `GET /health` Verification (Live Curl):**
  ```json
  {
    "status": "ok",
    "health": "healthy",
    "version": "0.1.0",
    "timestamp": "2026-08-27T14:35:57.331Z",
    "dependencies": {
      "database": "ok",
      "redis": "ok"
    }
  }
  ```

---

## Phase 2: Infrastructure as Code (Docker Compose Full Stack)

### Compose Configuration (`docker-compose.yml`)
- Extended `docker-compose.yml` to define full containerized stack:
  - `postgres`: PostgreSQL 16 Alpine (`opspilot-postgres`, port `5432:5432`, healthcheck `pg_isready -U opspilot -d opspilot`).
  - `redis`: Redis 7.2 Alpine (`opspilot-redis`, port `6379:6379`, healthcheck `redis-cli ping`).
  - `otel-collector`: OpenTelemetry Collector Contrib (`opspilot-otel-collector`, ports `4317`, `4318`, `9464`).
  - `prometheus`: Prometheus v2.53.1 (`opspilot-prometheus`, port `9090:9090`).
  - `api`: Fastify backend container built from `apps/api/Dockerfile` (`opspilot-api`, port `3001:3001`).
    - Container networking: `DATABASE_URL=postgresql://opspilot:opspilot@postgres:5432/opspilot?sslmode=disable`, `REDIS_URL=redis://redis:6379`.
    - Automatic initialization: Container command executes `pnpm exec prisma migrate deploy --schema=prisma/schema.prisma && npx tsx scripts/seed.ts && node apps/api/dist/server.js`.
    - Healthcheck: `node -e "fetch('http://localhost:3001/health')..."` (Node 22 native fetch).
    - `depends_on`: `postgres` (`service_healthy`), `redis` (`service_healthy`).
  - `web`: React / Vite UI container built from `apps/web/Dockerfile` (`opspilot-web`, port `3000:3000`).
    - Build args: `VITE_API_URL=http://localhost:3001`, `VITE_MAINTENANCE_MODE=false`.
    - `depends_on`: `api` (`service_healthy`).

---

### Direct Host-Run Workflow Preservation (Step 2 Regression Audit)
- **Host Execution:** Executed `pnpm --filter @opspilot/api exec tsx src/server.ts` directly on host Node.js (bypassing Docker API container, connecting to local `localhost:5432` PostgreSQL & `localhost:6379` Redis containers).
- **Verification (`curl http://localhost:3001/health`):**
  ```json
  {
    "status": "ok",
    "health": "healthy",
    "version": "0.1.0",
    "timestamp": "2026-08-27T17:39:46.993Z",
    "dependencies": {
      "database": "ok",
      "redis": "ok"
    }
  }
  ```
- **Result:** Direct host-run workflow functions cleanly alongside Docker Compose containerized stack.

---

### Fresh Clone One-Command Verification (Step 3 Proof)
1. **Isolated Clone:** Cloned main repository to throwaway directory `/tmp/opspilot-fresh-clone-test`.
2. **Environment Setup:** Copied `.env.example` to `.env` (zero manual edits).
3. **Execution:** Executed `docker compose up --build -d`.
4. **Automated Initialization:**
   - Database migrations applied cleanly (`prisma migrate deploy`).
   - Domain seed executed (`scripts/seed.ts` populated 9 services, topology nodes/edges, and initial simulation state).
   - All 6 containers reached `Up (healthy)` state.
5. **Host Curl Responses (External Network Verification):**
   - **`GET http://localhost:3001/health`:**
     ```json
     {
       "status": "ok",
       "health": "healthy",
       "version": "0.1.0",
       "timestamp": "2026-08-27T17:47:39.955Z",
       "dependencies": {
         "database": "ok",
         "redis": "ok"
       }
     }
     ```
   - **`GET http://localhost:3001/api/v1/services`:** Returned 9 seeded services with full simulation state objects.
   - **`GET http://localhost:3000` (Web UI):** HTTP 200 OK (`Vary: Origin`, `Content-Type: text/html`).
6. **Teardown:** Ran `docker compose down -v` and removed `/tmp/opspilot-fresh-clone-test`.

---

## Phase Summary & Status

| Phase | Description | Status |
|---|---|---|
| **Phase 1** | CI/CD Pipeline (`ci.yml`, Fail/Pass Proof, PR #1 Merged) | **COMPLETED** |
| **Phase 2** | Infrastructure as Code (Full Stack Compose, Fresh Clone Verified) | **COMPLETED** |
| **Phase 3** | Operational Hardening & Chaos Testing | *Pending* |

