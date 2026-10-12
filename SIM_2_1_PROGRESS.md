# Sim 2.1 Progress & Execution Record

**Last updated: 2026-10-12 | main @ ad10040**

---

## 🟢 Simulation Phase Status (Phases 1–10)

| Phase | Description | Status | Evidence / Notes |
|---|---|---|---|
| **Phase 1** | CI/CD Pipeline Implementation | `[x]` | PR #1 fail→pass proof; Note: `TURBO_FORCE=true` workaround, root cause unconfirmed. |
| **Phase 2** | Infrastructure as Code (IaC) | `[x]` | Full-stack Docker Compose verified; Note: container startup seed wipes data. |
| **Security Retrofit** | Security Shift-Left Retrofit | `[x]` | PR #2 merged 2026-08-30 + #3 (JWT/Argon2id), #4 (fail-closed R-17), #5 (ai.routes.ts authz), #6 (audit zero high/critical), #7 (gitleaks hard-fail). |
| **Phase 3** | Documentation baseline (OpenAPI, architecture diagram, README) | `[x]` | All 3 verified from repository files:<br>• OpenAPI spec: [`openapi.json`](./openapi.json) (served at `/documentation` via `@fastify/swagger-ui` in [`apps/api/src/app.ts#L119`](./apps/api/src/app.ts#L119))<br>• Architecture diagram: Mermaid diagram embedded in [`README.md#L60`](./README.md#L60)<br>• README Render section: Cloud deployment section in [`README.md#L138`](./README.md#L138) |
| **Phase 4** | Python service — foundation + Drift | `[ ]` | Not started. Threat model must settle RBAC + auto-link logic — see Decisions log 2026-10-12. |
| **Phase 5** | Python service — forecasting, embeddings, FAISS, Fairlearn | `[ ]` | Not started. |
| **Phase 6** | AI Governance standard (top-3 evidence-backed options, human confirmation) | `[ ]` | Not started. |
| **Phase 7** | Governance framework mapping (ISO 42001 / NIST AI RMF / EU AI Act) | `[ ]` | Not started. |
| **Phase 8** | Security & data policy | `[ ]` | Not started. |
| **Phase 9** | One polished frontend module (Governance) | `[ ]` | Not started. Scope fixed — see Decisions log 2026-10-12. |
| **Phase 10** | Cloud deployment | `[~]` | **DEVIATION:** Prod live on Render ahead of sign-off (Railway trial expired → contingency executed).<br>• Frontend Web: [`https://opspilot-web-wf6g.onrender.com`](https://opspilot-web-wf6g.onrender.com)<br>• Backend API: [`https://opspilot-ai-0seb.onrender.com`](https://opspilot-ai-0seb.onrender.com) |

---

## 🚀 Changes Recorded by Pull Request (PR #2 – PR #25)

Every pull request merged into `main` since the initial CI/CD pipeline setup (PR #1), with exact titles and merge timestamps:

- **PR #2**: `security: shift-left retrofit — threat model, route auth, rate limits, CI scanning` (Merged: 2026-08-30T04:40:03Z)
- **PR #3**: `feat(auth): real authentication flow — JWT login, Argon2id, in-memory React state` (Merged: 2026-08-30T04:15:41Z)
- **PR #4**: `security: fail-closed auth fallback fix (R-17)` (Merged: 2026-08-30T05:17:23Z)
- **PR #5**: `feat(authz): authorization guards on ai.routes.ts (Task 1)` (Merged: 2026-08-30T05:46:53Z)
- **PR #6**: `security(deps): patch baseline audit vulnerabilities and enforce zero high/critical in CI (Task 2)` (Merged: 2026-08-30T05:46:35Z)
- **PR #7**: `ci(gitleaks): enforce hard-fail on secret scan in CI workflow (Task 3)` (Merged: 2026-08-30T05:47:22Z)
- **PR #8**: `fix(auth): wrap app in AuthProvider` (Merged: 2026-08-31T03:03:17Z)
- **PR #9**: `fix(tests): restore missing test scripts across 8 packages, revert un…` (Merged: 2026-08-31T05:43:40Z)
- **PR #10**: `fix(web): add onError handling to all mutations, gate telemetry contr…` (Merged: 2026-09-02T08:23:50Z)
- **PR #11**: `docs: add security section, verify architecture diagram, and resolve …` (Merged: 2026-09-03T17:26:52Z)
- **PR #12**: `fix(deps): pin fast-uri to ^3.1.6, patching newly-disclosed high-seve…` (Merged: 2026-09-02T19:06:26Z)
- **PR #13**: `docs(tracker): record production redeployment and watch-path fix (no …` (Merged: 2026-09-05T02:24:46Z)
- **PR #14**: `Docs/cutover to render` (Merged: 2026-09-16T06:12:06Z)
- **PR #15**: `fix(deps): pin js-yaml to ^4.3.2, patching newly-disclosed high-sever…` (Merged: 2026-09-15T10:35:43Z)
- **PR #16**: `feat(web): add video-backed login landing page as first-visit gate` (Merged: 2026-09-16T08:19:48Z)
- **PR #17**: `feat(web): replace duplicate SLO Compliance card with Toil Hours Saved` (Merged: 2026-09-26T17:39:51Z)
- **PR #18**: `feat(web): add smooth audio fade at login video loop point` (Merged: 2026-09-26T17:40:46Z)
- **PR #19**: `style(web): restyle glassmorphism login card with frosted glass borde…` (Merged: 2026-09-27T05:19:07Z)
- **PR #20**: `style(web): adjust login card container max-width to max-w-sm and pad…` (Merged: 2026-09-27T08:06:41Z)
- **PR #21**: `style(web): scale video background to 2.2x to zoom hero visual focus` (Merged: 2026-09-27T08:43:59Z)
- **PR #22**: `revert(web): remove login background video zoom, ghost panels unaffected` (Merged: 2026-09-27T09:27:19Z)
- **PR #23**: `style(web): update glassmorphism login card to side-by-side two-colum…` (Merged: 2026-10-09T08:29:54Z)
- **PR #24**: `fix(deps): override vulnerable transitive deps to clear pnpm audit` (Merged: 2026-10-09T08:05:04Z)
- **PR #25**: `fix(web): smooth login audio loop fade (rAF + eased ramp, zero at loo…` (Merged: 2026-10-09T11:16:15Z)

---

## ⚠️ Open Risks / Housekeeping

- **`braces` GHSA-vfj7-8cjw-p6xm ignored in `auditConfig`:**
  Ignored in `pnpm-workspace.yaml` (`auditConfig.ignoreGhsas: [GHSA-vfj7-8cjw-p6xm]`) due to no patched release upstream (latest upstream is 3.0.3). Recheck weekly, remove ignore when `braces` is released at `>=3.0.4`.
- **Orphaned Duplicate Render API Service:**
  Orphaned duplicate Render API service exists from initial migration — delete.
- **Parked: Login Ghost Frame:**
  Login ghost frame (~576px card vs ~624×420 envelope @1647px; planned fix ~40vw/26.4vw at `xl:+`).

---

## ☁️ Production Hosting & Infrastructure

> **Railway Status: RETIRED**
> The original Railway deployment was retired following trial expiration. Contingency was executed to cut over production hosting to Render.

- **Current Live Services:**
  - **Frontend UI**: [Render Free Tier](https://opspilot-web-wf6g.onrender.com) (`https://opspilot-web-wf6g.onrender.com`)
  - **Backend API**: [Render Free Tier](https://opspilot-ai-0seb.onrender.com) (`https://opspilot-ai-0seb.onrender.com`)
  - **Database**: Neon Managed Serverless PostgreSQL
  - **Redis Cache**: Upstash Managed Serverless Redis
- **Deployment Watch Patterns:**
  - Render webhooks trigger builds on changes to `main`. Root lockfile updates trigger backend/frontend redeployments cleanly.

---

## 🛑 Permanent Standing Rules

- **No Unsupervised Changes to `main`, Production Infrastructure, or Credentials:**
  Never run any of the following without the exact command being shown first and explicitly approved:
  1. `git commit`, `git push`, `git reset --hard`, or any command that rewrites history or moves a branch pointer.
  2. Any production cloud CLI or management commands that change state (variables set, service restarts, manual redeployments).
  3. Any command that reads, uses, or acts on a credential, token, or database password — even read-only actions must be flagged, and secrets must never be logged.
  - When changes or fixes are needed:
    1. Diagnose and explain what is wrong.
    2. Propose the exact fix (literal command or diff).
    3. Wait for explicit user approval.
    4. Only then execute.

---

## Decisions log

### 2026-10-12
1. AI incident ↔ ops incident link is BIDIRECTIONAL (approved). Existing schema supports it with no migration:
   AiIncident.relatedIncidentId → Incident (onDelete: SetNull); Incident.aiIncidents AiIncident[].
   Gaps: (a) drift auto-escalation never sets relatedIncidentId; it is only set manually via POST in ai-incidents.routes.ts.
         (b) the incidents API and IncidentDetail.tsx do not expose linked AI incidents.
2. Auto-link rule: exactly 1 open ops incident on the asset's serviceId → auto-link plus a timeline entry;
   more than 1 → suggested links for human confirmation; the same rule applies in reverse when an ops incident opens.
3. RBAC (PROPOSED, to be confirmed in the Phase 4 threat model): the link is visible to all roles; AI incident detail is role-gated.
4. UI sequencing: a thin read-only AI Incidents list/detail plus a "Linked AI incidents" panel on IncidentDetail, immediately after Phase 4.
   Phase 9 scope: AI Governance section with sub-tabs AI Incidents | Drift Monitors | Model Register (Governed Assets) | Approvals.

---

## Historical record (pre-2026-10-12)

The following sections are preserved verbatim from the historical record of this tracking document prior to 2026-10-12.

### Historical Live Dashboard (as of 2026-08-30)

| Item | Status | Evidence | Last Verified |
|---|---|---|---|
| CI/CD Pipeline Setup (PR #1) | ✅ **Merged** | [PR #1](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/1) / [`463682f`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/463682f24e76622860824defa9e6076857f9a622) | 2026-08-27 |
| Security Shift-Left Retrofit (PR #2) | ✅ **Merged** | [PR #2](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/2) / [`536568a`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/536568a) | 2026-08-29 |
| Real Auth Flow & Token Handling (PR #3) | ✅ **Merged** | [PR #3](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/3) / [`7bc7ae0`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/7bc7ae0) | 2026-08-29 |
| Fail-Closed Auth Fallback Fix (PR #4) | ✅ **Merged** | [PR #4](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/4) / [`d15ad27`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/d15ad27) | 2026-08-30 |
| AI Routes Auth Guards (PR #5) | ✅ **Merged** | [PR #5](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/5) / [`b223f6a`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/b223f6a) | 2026-08-30 |
| Fastify 4→5 Upgrade & Audit Patches (PR #6) | ✅ **Merged** | [PR #6](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/6) / [`daff1b9`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/daff1b9) | 2026-08-30 |
| Gitleaks Hard-Fail Enforcement (PR #7) | ✅ **Merged** | [PR #7](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/7) / [`ea2e714`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/ea2e714) | 2026-08-30 |
| OpenAPI Specification Completeness (Phase 3 PR 1) | ✅ **Merged** | [`f7760d6`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/f7760d6) | 2026-08-30 |
| Mutation error handling & telemetry role-gating (PR #10) | ✅ **Merged & Confirmed Live in Production** | [PR #10](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/10) / [`934bdea`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/934bdea4b8d86944ad0906175bc2593e5883be37) — commit hash cross-confirmed identical between GitHub's main HEAD and Railway's deployed build (deploymentId: `e35db7fd-9e34-4cde-a2e2-3148914dc6b3`, deployed `2026-09-02T08:23:52.516Z`) | 2026-09-02 |
| Production Sync Gap — Stale API Deployment + Watch-Path Fix | ✅ **Diagnosed & Resolved** | No corresponding PR — infrastructure-only fix via Railway CLI/GraphQL. `@opspilot/api` manually redeployed from source to [`24c85b8`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/24c85b8bf45e7c7f401128bd652e47afbd366e92) (deploymentId: `eccc6a26-a498-45bb-8c41-b5e4d74ebe58`), confirmed via independent full-hash match. Root cause: Railway's watch patterns for `@opspilot/api`/`@opspilot/web` only tracked `apps/*/**`, silently skipping rebuilds when root-level `pnpm-lock.yaml`/`pnpm-workspace.yaml` changed (this is how the PR #12 `fast-uri` patch sat unmerged into production for 2+ days despite being on `main`). Watch patterns corrected on both services to include root dependency files. `opspilot-prometheus` confirmed unaffected (standalone Docker build, no Node/pnpm dependency tree). | 2026-09-04 |

### Historical Known Risks / Watchlist (pre-2026-10-12)
- **Dependency override ranges** — pinned to caret (`^`) in `pnpm-workspace.yaml` as of [`0e4bd23`](https://github.com/adityasaxena-ai/OpsPilot-AI/commit/0e4bd23). Check: `pnpm list find-my-way @fastify/static nanoid cross-spawn vite vitest --depth=0` after any `pnpm install`, confirm versions stay within the pinned caret ranges and pass `pnpm audit --audit-level=high`. Last checked: 2026-08-30.
- **Package `test` scripts** — confirm all packages with `.test.ts` files have a working `test` script (`"test": "vitest run --passWithNoTests"`) before trusting any `pnpm test` total as complete. Last checked: 2026-08-31.
- **"Is it actually deployed" verification** — always cross-check a deployment's reported commit hash against the actual value from `git log` / GitHub directly (full hash, not the first 7 characters alone) before treating a deployment as confirmed current. A partial match or a plausible-looking timestamp is not sufficient — this project has been burned by stale/incorrect deployment claims multiple times (CommandCenter crash fix, AuthProvider fix, this one). Full-hash cross-confirmation is the standard now. Last checked: 2026-09-02.

### Step 0: Fact-Check — Production Deployment State

Prior to initiating Sim 2.1 Phase 1, an empirical audit of the live Railway production environment (`@opspilot/api`) was performed.

#### Findings
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

### Phase 1: CI/CD Pipeline Implementation

#### Workflow Configuration (`.github/workflows/ci.yml`)
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

#### Empirical Verification Proof (Fail-Then-Pass Pipeline Audit)

To guarantee the pipeline actively catches regressions rather than acting as a passive check, a deliberate failure test was executed on PR #1 (`ci/setup-pipeline` → `main`).

1. **Initial CI Run (Green Baseline):**
   - **Branch/Commit:** `ci/setup-pipeline` (`e243524`)
   - **Workflow Run ID:** `33067171443`
   - **Result:** **`SUCCESS`** (All 21 job steps passed cleanly).

2. **Deliberate Failure Test (Red Proof):**
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

3. **Clean Revert Test (Green Resolution):**
   - **Revert Applied:** Restored `expect(result.incidentId).toBe('inc-dec-001')`.
   - **Commit:** `d411829`
   - **Workflow Run ID:** [`33082850052`](https://github.com/adityasaxena-ai/OpsPilot-AI/actions/runs/33082850052)
   - **Result:** **`SUCCESS`** (All 21 steps passed, job green).

#### Phase 1 Merge & Production Verification

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

### Phase 2: Infrastructure as Code (Docker Compose Full Stack)

#### Compose Configuration (`docker-compose.yml`)
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

#### Direct Host-Run Workflow Preservation (Step 2 Regression Audit)
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

#### Fresh Clone One-Command Verification (Step 3 Proof)
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

### Pre-Phase 3: Security Shift-Left Retrofit (Historical Execution Details)

**Branch:** `security/shift-left`
**Commit:** `ee9761745557eda509218ca0a991362c994b7036` (`ee97617`)
**Resolution:** Fully completed and merged across PRs #2, #3, #4, #5, #6, and #7.

#### Threat Model
See `THREAT_MODEL_SECURITY_RETROFIT.md` for the full risk register (R-01
through R-10), attack surface breakdown, and trust boundaries.

#### Authorization Audit
See `AUTHZ_AUDIT.md` for the complete route-by-route protection table
(98 endpoints across 21 route modules, cross-checked against
`apps/api/src/app.ts` plugin registration).

#### Changes Made

##### Auth Enforcement (R-01 through R-04)
`requirePermission()` guards added to 14 previously-unprotected mutation
endpoints:
- **Simulator** (`POST /chaos`, `/heal`, `/deploy`): `REMEDIATION_EXECUTE` (INCIDENT_COMMANDER)
- **Rules** (`POST`/`PUT`/`DELETE`): `REMEDIATION_APPROVE` (SRE_OPERATOR+)
- **Telemetry mutations** (`provider`/`record`/`replay`): `ADMIN_CONFIGURATION` (SECURITY_ADMIN)
- **Alerts** `PATCH`: `INCIDENT_VIEW`
- **Incidents** `PATCH`: `INCIDENT_VIEW` / `REMEDIATION_APPROVE`
- **Events** `POST`: `INCIDENT_VIEW`

##### Rate Limit Tightening (R-06)
- Global limit: 500 → 200 req/min per IP
- Simulator POST routes: additional 30 req/min per-route override

##### Production Safety Guard (R-05)
- `auth.middleware.ts`: process exits on startup if `ENABLE_DEMO_AUTH=true`
  while `NODE_ENV=production`

##### CI Security Scanning
- `pnpm audit --audit-level=high` added to `ci.yml` (enforced zero high/critical in PR #6)
- `gitleaks/gitleaks-action@v2` added to `ci.yml` (enforced hard-fail in PR #7)
- `.gitleaks.toml` allowlists documented CI-only dummy JWT secret values

#### Verification
- CI runs verified clean across all steps.
- Live auth/rate-limit probes: raw terminal output saved at [`security/live_probes_verification.log`](./security/live_probes_verification.log).
- Auth gap on `ai.routes.ts` resolved in PR #5 (`feat(authz): authorization guards on ai.routes.ts`).
