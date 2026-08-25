# OpsPilot AI — Local Baseline Record
**Baseline Date:** 2026-08-24  
**Git Commit SHA:** `3026bdc1815ad821a7199464eebaa50ee8c4e511`  
**Git Branch:** `main` (synchronized with `origin/main`)

---

## 1. Environment & Dependency Versions

| Component | Version | Source / Notes |
|---|---|---|
| Node.js | `v24.14.0` | `node -v` |
| pnpm | `v11.20.0` | `pnpm -v` |
| PostgreSQL | `PostgreSQL 16-alpine` | `postgres:16-alpine` Docker container |
| Redis | `Redis 7.2-alpine` | `redis:7.2-alpine` Docker container |
| Turbo | `2.10.8` | Monorepo build orchestrator |
| Vitest | `2.1.9` | API test runner |

---

## 2. Step-by-Step Baseline Verification Results

### Step 1 — Clean Environment Setup
- **Git Status:** Clean working tree. Commit SHA: `a179865c29c90df10a5a6991a464c5e397085584`.
- **Stopped Services:**
  - Running Docker containers (`opspilot-postgres`, `opspilot-redis`, `opspilot-prometheus`, `opspilot-otel-collector`, `distracted_booth`, `vigorous_spence`) were stopped and volumes removed via `docker-compose down -v`.
  - Node.js dev servers listening on ports 3000 and 3001 were terminated.
- **Started Services:**
  - Executed: `docker-compose up -d postgres redis`
  - Health checks confirmed:
    - `pg_isready -U opspilot -d opspilot`: `/var/run/postgresql:5432 - accepting connections`
    - `redis-cli ping`: `PONG`

### Step 2 — Schema Baseline & Migration Drift Audit
- **Prisma Migration Execution:**
  - Executed: `DATABASE_URL="postgresql://opspilot:opspilot@localhost:5432/opspilot?sslmode=disable" pnpm db:migrate`
  - Applied migrations: `20260806000000_init`, `20260811000000_add_missing_incident_statuses`.
  - Migration output: `All migrations have been successfully applied.`
- **Schema Drift Audit (`threshold_rules` table):**
  - **Empirical Finding:** `psql` relation listing (`\dt`) confirmed **22 tables** created. The `threshold_rules` table was **NOT created**.
  - **Root Cause:** `20260806000000_init/migration.sql` lacks a `CREATE TABLE "threshold_rules"` statement despite the model existing in `schema.prisma`.
  - **Seed Impact:** Running `pnpm db:seed` fails at `prisma.thresholdRule.create()` with `P2021: The table public.threshold_rules does not exist in the current database.`
  - **Status:** Explicitly flagged as an unmigrated schema drift for post-baseline remediation.

### Step 3 — Build and Typecheck
- `pnpm install`: Succeeded cleanly in 269ms.
- `pnpm typecheck`: 20/20 tasks successful across 11 packages.
- `pnpm build`: 11/11 packages built successfully (`@opspilot/web` transformed 2571 modules, built in 2.92s).

### Step 4 — Full Test Suite
- Executed: `pnpm test`
- Scope: `@opspilot/api` vitest runner (10/10 tasks successful)
- **Results:**
  - `src/modules/ai/rca-engine.service.test.ts` (4 passed)
  - `src/modules/ai/change-correlation.service.test.ts` (6 passed)
  - `src/modules/ai/decision-engine.service.test.ts` (4 passed)
  - **Total:** 3 test files passed, 14 tests passed, 0 failures.

### Step 5 — Two Environment-Mode Smoke Tests (Real Running Server)

#### Mode A: `NODE_ENV=development`
Server started on `http://127.0.0.1:3001`.

- `GET /health` → `200 OK`
  `{"status":"ok","health":"healthy","version":"0.1.0","timestamp":"...","dependencies":{"database":"ok","redis":"ok"}}`
- `GET /api/v1/telemetry/status` → `200 OK`
  `{"success":true,"data":{"providerName":"mock","status":"HEALTHY","activeSource":"OpsPilot Simulated Telemetry Stream (Demo Mode)","isReplaying":false,"isRecording":false,"lastUpdated":"..."}}`
- `GET /api/v1/incidents` → `200 OK`
  `{"success":true,"data":[],"meta":{"total":0,"limit":20,"offset":0}}`
- `GET /api/v1/services` → `200 OK`
  `{"success":true,"data":[...9 services...],"meta":{"total":9}}`

#### Mode B: `NODE_ENV=production`
Server started on `http://127.0.0.1:3001`.

- `GET /health` → `200 OK`
- `GET /api/v1/telemetry/status` → `200 OK`
- `GET /api/v1/incidents` → `200 OK`
- `GET /api/v1/services` → `200 OK`
- **Auth Fix Re-Verification (`POST /api/v1/remediation/1/execute` with `Authorization: Bearer test-token-SECURITY_ADMIN-anyone`):**
  - **Response:** `HTTP/1.1 401 Unauthorized`
  - **Body:** `{"success":false,"error":{"code":"INVALID_TOKEN","message":"Invalid authentication token"}}`

#### Behavioral Differences Analysis:
- Public telemetry and health endpoints behave consistently across both modes.
- In `development` mode, mock test tokens (`test-token-...`) are allowed for local authentication bypass.
- In `production` mode, mock test tokens are strictly blocked with HTTP 401 `INVALID_TOKEN`.

### Step 6 — Web Frontend Smoke Test
- Executed: `pnpm --filter @opspilot/web dev` on `http://localhost:3000`
- Response: `HTTP/1.1 200 OK`, HTML root rendered cleanly without errors.

### Step 7 — Housekeeping Check on `test-token-` References
- Inspected: `scratch/test_step7_step8_live_cloud_verification.js`
- **Target Base URLs:**
  - `baseUrl`: `https://opspilotapi-production.up.railway.app`
  - `webUrl`: `https://opspilotweb-production.up.railway.app`
- **Flag:** This scratch test hardcodes live Railway production URLs. Running `test-token-` headers against this live production URL will now return `401 INVALID_TOKEN` due to the production auth fix.

---

## 3. Formal Baseline Declaration

This commit (`a179865c29c90df10a5a6991a464c5e397085584`) and this environment configuration represent a verified, reproducible local baseline as of 2026-08-24. All Simulation 2.0 work proceeds from this baseline, built and verified locally first.

---

## 4. Addendum: Real HS256 JWT Signature Verification & Magic-String Bypass Retirement (2026-08-24)

### Overview of Changes
1. **Config & Environment Hardening:** Added required `JWT_SECRET: z.string().min(32)` to `packages/config/src/index.ts`. Added 46-char `JWT_SECRET` to `.env` and `.env.example`.
2. **Real HS256 Verification:** Installed `jsonwebtoken` (`^9.0.2`) in `@opspilot/api`. Rewrote `parseJwt()` in `apps/api/src/modules/auth/jwt.service.ts` to perform real cryptographic HS256 signature verification via `jwt.verify(token, config.JWT_SECRET, { algorithms: ['HS256'], issuer, audience })`.
3. **Bypass Retirement:** Completely removed the `test-token-` magic-string branch from `jwt.service.ts`.
4. **Dev Token Utility:** Created `scripts/mint-dev-token.ts` CLI tool (`npx tsx scripts/mint-dev-token.ts [ROLE] [SUBJECT]`) to sign 24h HS256 dev JWTs for local testing.
5. **Role Decision Documented:** Added factual decision comments in `prisma/schema.prisma` above `User.role` and `apps/api/src/modules/auth/auth.types.ts` above `Role`.

### Verification Results

#### 1. Build & Typecheck & Tests
- `pnpm typecheck`: 20/20 tasks successful across 11 packages.
- `pnpm build`: 11/11 packages built successfully.
- `pnpm test`: 3 test files passed, 14 tests passed, 0 failures.

#### 2. Development Mode Smoke Tests (`NODE_ENV=development`)
- **Valid Signed Dev Token (`INCIDENT_COMMANDER` role):**  
  `POST /api/v1/remediation/1/execute` with Bearer token minted via `mint-dev-token.ts`  
  `HTTP/1.1 404 Not Found` — `{"success":false,"error":{"code":"NOT_FOUND","message":"Action not found"}}`  
  *(Authenticated & authorized successfully; reached business layer which returned 404 for missing action ID)*
- **Retired Bypass String (`test-token-SECURITY_ADMIN-anyone`):**  
  `POST /api/v1/remediation/1/execute`  
  `HTTP/1.1 401 Unauthorized` — `{"success":false,"error":{"code":"INVALID_TOKEN","message":"Invalid authentication token"}}`  
  *(Bypass fully disabled in dev mode)*

#### 3. Production Mode Smoke Tests (`NODE_ENV=production`)
- **Valid Signed Dev Token (`INCIDENT_COMMANDER` role):**  
  `POST /api/v1/remediation/1/execute` with Bearer token minted via `mint-dev-token.ts`  
  `HTTP/1.1 404 Not Found` — `{"success":false,"error":{"code":"NOT_FOUND","message":"Action not found"}}`  
  *(Authenticated & authorized successfully in production mode)*
- **Retired Bypass String (`test-token-SECURITY_ADMIN-anyone`):**  
  `POST /api/v1/remediation/1/execute`  
  `HTTP/1.1 401 Unauthorized` — `{"success":false,"error":{"code":"INVALID_TOKEN","message":"Invalid authentication token"}}`  
  *(401 Unauthorized in production mode)*

---

## 5. Addendum: Baseline Finalization & Four-Fix Closure (2026-08-24)

### Fix 1 — `scripts/mint-dev-token.ts` Hardening
- Removed hardcoded secret fallback string entirely.
- Updated script to import `getConfig()` from `@opspilot/config` so missing or invalid `JWT_SECRET` fails loudly via Zod schema.
- Re-tested:
  - **With `JWT_SECRET` set:** `pnpm --filter @opspilot/api exec tsx ../../scripts/mint-dev-token.ts SECURITY_ADMIN test-admin` succeeded and outputted signed HS256 JWT.
  - **With `JWT_SECRET` unset (`JWT_SECRET=`):** Failed loudly with exit code 1 and error `❌ Invalid environment configuration: JWT_SECRET: String must contain at least 32 character(s)`.
- **Git Tracking Verification (`.env`):** `git ls-files .env` returned empty string (`.env` is properly ignored via `.gitignore`).
- **Grep Audit:** Confirmed no hardcoded `JWT_SECRET` values exist in tracked repository files.

### Fix 2 — Local `DATABASE_URL` Default Correction
- Updated `.env` active `DATABASE_URL` to local Docker Postgres container (`postgresql://opspilot:opspilot@localhost:5432/opspilot?sslmode=disable`).
- Commented out remote Neon DB URL with clear label `# Remote Neon DB (for cloud testing) - not used for local dev`.
- Updated `.env.example` to list local Docker Postgres URL as default example.
- **Git History Credential Audit:** Executed `git log -S "npg_"` and `git log -S "ep-floral-block"`. Confirmed zero Neon DB credentials or hostnames were ever committed to git history.

### Fix 3 — Missing `threshold_rules` Additive Migration & Seed Verification
- Created new additive migration: `prisma/migrations/20260824000000_add_threshold_rules_table/migration.sql`.
- Ran `docker-compose down -v && docker-compose up -d postgres redis` clean container initialization.
- Ran `pnpm db:migrate` against local Postgres: applied all 3 migrations (`20260806000000_init`, `20260811000000_add_missing_incident_statuses`, `20260824000000_add_threshold_rules_table`).
- Verified `psql \dt` table list: confirmed **23 tables** present including `public.threshold_rules`.
- Executed `pnpm db:seed`: completed with zero errors (`Services: 9, Dependencies: 11, Policies: 5, Runbooks: 3, Threshold Rules: 4`).

### Fix 4 — Scratch Script Housekeeping
- Added explanatory comment to `scratch/test_step7_step8_live_cloud_verification.js` documenting `test-token-` removal and future `mint-dev-token.ts` requirement.
- Verified `scratch/test_phase6_enterprise_identity.js`: confirmed it is an uninvoked standalone historical file not referenced by any script or CI job.

### Final Clean Verification Summary
1. `pnpm install`: Clean (lockfile up to date).
2. `pnpm typecheck`: 20/20 tasks passed across 11 packages.
3. `pnpm build`: 11/11 packages built successfully.
4. `pnpm test`: 3 files passed, 14 tests passed, 0 failures.
5. `NODE_ENV=development` & `NODE_ENV=production` real server smoke tests: `/health`, `/api/v1/telemetry/status`, `/api/v1/incidents`, `/api/v1/services` all returned `200 OK` on clean seeded database.

---

## 6. Addendum: Railway Production Sync & Live Auth Bypass Closure (2026-08-25)

### Pre-Deployment Environment Preparation
1. **Cryptographic `JWT_SECRET` Generation & Injection:** Generated a 64-character (48 random bytes) cryptographically random production `JWT_SECRET` using Node `crypto.randomBytes(48)`. Set on Railway via `npx @railway/cli variables set JWT_SECRET="..." --service @opspilot/api`.
2. **`NODE_ENV` Injection:** Set `NODE_ENV=production` on Railway via `npx @railway/cli variables set NODE_ENV=production --service @opspilot/api`.
3. **Environment Audit:** Re-ran `railway variables -s @opspilot/api`. Confirmed both `JWT_SECRET` and `NODE_ENV` are present in production variables.

### Git Commits & Deployment
1. **Commit 1 (`167345f`):** `feat(auth): implement HS256 JWT signature verification and retire test-token bypass`
2. **Commit 2 (`371000f`):** `fix(db): add additive migration for threshold_rules table and document User.role`
3. **Commit 3 (`3026bdc`):** `docs(baseline): document local baseline record and four-fix closure`
4. **Push:** Pushed `main` to `origin/main` (`a179865..3026bdc`).
5. **Railway Deployment:** Triggered deployment `5ec7b69e-a6f9-4d05-90b3-59f6f15189bb` on `@opspilot/api`. Deployment reached `SUCCESS` state at 2026-08-25 09:48:43 IST.

### Live Production Verification Results
1. **`GET /health`:** `HTTP/2 200 OK` (`{"status":"ok","health":"healthy","version":"0.1.0"}`)
2. **`GET /api/v1/telemetry/status`:** `HTTP/2 200 OK` (`{"success":true,"data":{"providerName":"otel","status":"HEALTHY","activeSource":"OpenTelemetry / Prometheus — Production"}}`)
3. **Bypass Closure Check (`POST /api/v1/remediation/1/execute` with Bearer `test-token-SECURITY_ADMIN-anyone`):**  
   `HTTP/2 401 Unauthorized` — `{"success":false,"error":{"code":"INVALID_TOKEN","message":"Invalid authentication token"}}`  
   *(Live authentication bypass is 100% CLOSED on production)*
4. **Valid Production HS256 JWT Verification:** Minted a temporary `INCIDENT_COMMANDER` JWT token using the production `JWT_SECRET`.  
   `POST /api/v1/remediation/1/execute`  
   `HTTP/2 404 Not Found` — `{"success":false,"error":{"code":"NOT_FOUND","message":"Action not found"}}`  
   *(Authenticated and authorized successfully in production; temporary script and token file destroyed immediately after use)*
5. **Production Database Consistency:** Verified 23 tables exist in Neon DB including `threshold_rules`, and `_prisma_migrations` records all 3 migrations (`20260806000000_init`, `20260811000000_add_missing_incident_statuses`, `20260824000000_add_threshold_rules_table`).
