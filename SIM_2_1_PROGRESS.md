# Sim 2.1 Progress & Execution Record

**Last updated: 2026-10-12 | main @ 46e8634**

---

## 🟢 Simulation Phase Status (Phases 1–10)

| Phase | Description | Status | Evidence / Notes |
|---|---|---|---|
| **Phase 1** | CI/CD Pipeline Implementation | `[x]` | PR #1 fail→pass proof; Note: `TURBO_FORCE=true` workaround, root cause unconfirmed. |
| **Phase 2** | Infrastructure as Code (IaC) | `[x]` | Full-stack Docker Compose verified; Note: container startup seed wipes data. |
| **Security Retrofit** | Pre-Phase 3 Security Shift-Left Retrofit | `[~]` | Built on `security/shift-left` (`ee97617`), PR #2 OPEN, not merged; open item: `ai.routes.ts` auth gap. |
| **Phase 3** | Operational Hardening & Chaos Testing | `[ ]` | Not started. |
| **Phase 4** | Staging Environment Setup | `[ ]` | Not started. |
| **Phase 5** | Production Readiness & Pre-Flight Checks | `[ ]` | Not started. |
| **Phase 6** | Observability & Telemetry Verification | `[ ]` | Not started. |
| **Phase 7** | Automated Rollback & Canary Deployment | `[ ]` | Not started. |
| **Phase 8** | Disaster Recovery & Backup Drills | `[ ]` | Not started. |
| **Phase 9** | Final Sign-Off & Verification | `[ ]` | Not started. |
| **Phase 10** | Production Cutover & Deployment | `[~]` | **DEVIATION:** Prod live on Render ahead of sign-off (Railway trial expired → contingency executed).<br>• Frontend Web: [`https://opspilot-web-wf6g.onrender.com`](https://opspilot-web-wf6g.onrender.com)<br>• Backend API: [`https://opspilot-ai-0seb.onrender.com`](https://opspilot-ai-0seb.onrender.com) |

---

## 🚀 Changes Since 2026-08-30

PRs merged into `main` since 2026-08-30 (PR #17 – PR #25):

- **PR #17**: `feat(web): replace duplicate SLO Compliance card with Toil Hours Saved` (Merged: 2026-09-26T17:39:51Z)
- **PR #18**: `feat(web): add smooth audio fade at login video loop point` (Merged: 2026-09-26T17:40:46Z)
- **PR #19**: `style(web): restyle glassmorphism login card with frosted glass borde…` (Merged: 2026-09-27T05:19:07Z)
- **PR #20**: `style(web): adjust login card container max-width to max-w-sm and pad…` (Merged: 2026-09-27T08:06:41Z)
- **PR #21**: `style(web): scale video background to 2.2x to zoom hero visual focus` (Merged: 2026-09-27T08:43:59Z)
- **PR #22**: `revert(web): remove login background video zoom, ghost panels unaffected` (Merged: 2026-09-27T09:27:19Z)
- **PR #23**: `style(web): update glassmorphism login card to side-by-side two-colum…` (Merged: 2026-10-09T08:29:54Z)
- **PR #24**: `fix(deps): override vulnerable transitive deps to clear pnpm audit` (Merged: 2026-10-09T08:05:04Z)
- **PR #25**: `fix(web): smooth login audio loop fade (rAF + eased ramp, zero at loo…` (Merged: 2026-10-09T11:16:15Z)

*(Note: Prior infrastructure and dependency updates between 2026-08-30 and 2026-09-16 include PR #8 AuthProvider, PR #9 tests restoration, PR #10 mutation error handling/telemetry gating, PR #11 Phase 3 docs/URLs, PR #12 `fast-uri` patch, PR #13 tracker update, PR #14 cutover to Render, PR #15 `js-yaml` patch, and PR #16 video-backed login landing page).*

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

## Phase 1: CI/CD Pipeline Implementation (Execution Proof)

### Workflow Configuration (`.github/workflows/ci.yml`)
- **Triggers:** `push` (all branches) and `pull_request` (targeting `main`).
- **Toolchain:** Node.js `22` (LTS, matching engine constraint `>=22.13.0`), `pnpm` `11.20.0` (`pnpm/action-setup@v4`).
- **Service Containers:**
  - PostgreSQL 16: `postgres:16-alpine`.
  - Redis 7.2: `redis:7.2-alpine`.
- **Execution Pipeline:**
  1. `pnpm install --frozen-lockfile`
  2. `pnpm db:migrate` (`prisma migrate deploy` against PostgreSQL service container)
  3. `pnpm typecheck`
  4. `pnpm build` (`turbo run build`)
  5. `pnpm test` (`turbo run test` with `TURBO_FORCE: "true"` to guarantee cache bypass in CI)
- **Workaround Note:**
  - `TURBO_FORCE="true"` is maintained as an active workaround in CI; root cause remains unconfirmed.

### Empirical Verification Proof (Fail-Then-Pass Pipeline Audit)
1. **Initial CI Run (Green Baseline):**
   - Branch/Commit: `ci/setup-pipeline` (`e243524`)
   - Workflow Run ID: `33067171443` (SUCCESS).
2. **Deliberate Failure Test (Red Proof):**
   - Assertion broken in `apps/api/src/modules/ai/decision-engine.service.test.ts` (`d6d5868`).
   - Workflow Run ID: [`33082652097`](https://github.com/adityasaxena-ai/OpsPilot-AI/actions/runs/33082652097) (FAILURE).
3. **Clean Revert Test (Green Resolution):**
   - Restored original assertion (`d411829`).
   - Workflow Run ID: [`33082850052`](https://github.com/adityasaxena-ai/OpsPilot-AI/actions/runs/33082850052) (SUCCESS).
- **PR:** [#1 (`ci/setup-pipeline` → `main`)](https://github.com/adityasaxena-ai/OpsPilot-AI/pull/1) merged at `463682f`.

---

## Phase 2: Infrastructure as Code (Docker Compose Full Stack)

### Compose Configuration (`docker-compose.yml`)
- `postgres`: PostgreSQL 16 Alpine (`opspilot-postgres`, port `5432:5432`).
- `redis`: Redis 7.2 Alpine (`opspilot-redis`, port `6379:6379`).
- `otel-collector`: OpenTelemetry Collector Contrib (`opspilot-otel-collector`, ports `4317`, `4318`, `9464`).
- `prometheus`: Prometheus v2.53.1 (`opspilot-prometheus`, port `9090:9090`).
- `api`: Fastify backend container (`opspilot-api`, port `3001:3001`).
  - Automatic initialization: Container command executes `pnpm exec prisma migrate deploy --schema=prisma/schema.prisma && npx tsx scripts/seed.ts && node apps/api/dist/server.js`.
  - **Note:** Container startup seed wipes and resets database data on initial run.
- `web`: React / Vite UI container (`opspilot-web`, port `3000:3000`).

### Verification Proof
- Direct host-run workflow preserved (`curl http://localhost:3001/health` healthy).
- Fresh clone one-command verification (`docker compose up --build -d` tested in isolated directory) confirmed clean health on all services.

---

## Pre-Phase 3: Security Shift-Left Retrofit

- **Branch:** `security/shift-left`
- **Commit:** `ee9761745557eda509218ca0a991362c994b7036` (`ee97617`)
- **Status:** Built on `security/shift-left` (`ee97617`), PR #2 OPEN, not merged; open item: `ai.routes.ts` auth gap.
- **Reference Artifacts:** `THREAT_MODEL_SECURITY_RETROFIT.md`, `AUTHZ_AUDIT.md`.
