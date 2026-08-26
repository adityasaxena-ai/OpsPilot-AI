# Production Incident Log

## Incident INC-2026-08-26-01: Telemetry Data Degradation & Database Connection Failure

**Date:** 2026-08-26  
**Environment:** Production (`graceful-upliftment` project on Railway)  
**Impacted Services:** `@opspilot/api`, `opspilot-prometheus`  
**Status:** Diagnosed & Documented  

---

### 1. Symptom Summary & Initial Report
- **Reported Symptom:** Telemetry modes (OTel Live, Replay, Mock) reportedly failing to pull data on production.
- **Initial Theory:** Prometheus service deployment misconfiguration on Railway causing telemetry provider failure across all modes.

---

### 2. Empirical Verification Evidence (Step 1 Findings)

1. **API Service Health (`GET /health`):**
   - **URL:** `https://opspilotapi-production.up.railway.app/health`
   - **HTTP Status:** `503 Service Unavailable`
   - **Response Body:**
     ```json
     {"status":"degraded","health":"degraded","version":"0.1.0","timestamp":"2026-08-26T11:04:22.966Z","dependencies":{"database":"error","redis":"ok"}}
     ```
   - **Finding:** The API service is running, but database health check fails explicitly (`database: error`).

2. **Telemetry Status (`GET /api/v1/telemetry/status`):**
   - **HTTP Status:** `200 OK`
   - **Response Body (OTel Live):**
     ```json
     {"success":true,"data":{"providerName":"otel","status":"HEALTHY","activeSource":"OpenTelemetry / Prometheus — Production","isReplaying":false,"isRecording":false,"lastUpdated":"2026-08-26T11:04:26.866Z","details":{"configured":true,"reachable":true}}}
     ```

3. **Mock Telemetry Provider Test (`POST /api/v1/telemetry/provider` with `{"provider":"mock"}`):**
   - **HTTP Status:** `200 OK`
   - **Response Body:**
     ```json
     {"success":true,"data":{"providerName":"mock","status":"HEALTHY","activeSource":"OpsPilot Simulated Telemetry Stream (Demo Mode)","isReplaying":false,"isRecording":false,"lastUpdated":"2026-08-26T11:04:43.755Z"}}
     ```
   - **Finding:** Mock mode does NOT fail at the provider level. It operates entirely in-memory with zero external dependencies.

4. **Replay Telemetry Provider Test (`POST /api/v1/telemetry/replay/start`):**
   - **HTTP Status:** `200 OK`
   - **Response Body:**
     ```json
     {"success":true,"data":{"providerName":"replay","status":"HEALTHY","activeSource":"Replaying recording \"Production Telemetry Incident Replay (Sample)\" (Frame 2/5)","isReplaying":true,"isRecording":false,"lastUpdated":"2026-08-26T11:05:01.081Z","details":{"currentFrame":1,"totalFrames":5}}}
     ```
   - **Finding:** Replay mode is 100% operational in memory.

5. **Railway Service Logs (`@opspilot/api` & `opspilot-prometheus`):**
   - `opspilot-prometheus` logs show normal TSDB operation.
   - `@opspilot/api` logs show repeated Prisma database connection failures:
     ```text
     prisma:error
     Invalid `prisma.simService.findMany()` invocation:
     Can't reach database server at `ep-floral-block-azsrnzo6-pooler.c-3.ap-southeast-1.aws.neon.tech:5432`
     ```
   - **Direct Database Test:** Querying Neon database via Prisma CLI returned:
     ```text
     Error: ERROR: Your account or project has exceeded the compute time quota. Upgrade your plan to increase limits.
     ```

---

### 3. Root Cause Analysis (Step 2 Findings)

Two distinct, independent root causes were confirmed by empirical evidence:

1. **Root Cause A — Neon PostgreSQL Compute Time Quota Exhaustion:**
   - The production PostgreSQL database hosted on Neon (`ep-floral-block-azsrnzo6-pooler.c-3.ap-southeast-1.aws.neon.tech:5432`) hit its free-tier compute time quota.
   - Neon rejected incoming SQL queries with `ERROR: Your account or project has exceeded the compute time quota`.
   - Because UI views (such as estate topology, incident details, and simulated service lists) join telemetry metrics with database models (`db.incident.findMany()`, `db.simService.findMany()`), database query timeouts caused these views to fail or render empty state across ALL telemetry modes (OTel, Mock, Replay).

2. **Root Cause B — Prometheus Service Root Directory Misconfiguration:**
   - The `opspilot-prometheus` service in Railway had its **Root Directory** unconfigured / set to `/` (repo root) rather than `apps/prometheus`.
   - Consequently, Railway attempted to build `apps/api/Dockerfile` during GitHub push triggers, causing `opspilot-prometheus` deployment to show `Deploy failed (1d)`.

---

### 4. Remediation Steps & Instructions (Step 3 & 4)

#### A. Fix Prometheus Root Directory Setting (Railway Dashboard Instructions)
*The Railway CLI does not expose direct flags for setting a service's Root Directory. Follow these step-by-step instructions in the Railway Dashboard:*

1. Log into [Railway Dashboard](https://railway.app).
2. Select project **`graceful-upliftment`** (or `OpsPilot-AI`).
3. Click on the **`opspilot-prometheus`** service card.
4. Go to **Settings** (gear icon).
5. Under the **Source** section, find the **Root Directory** field.
6. Enter `apps/prometheus` in the **Root Directory** field and click **Save**.
7. Under **Deploy**, verify `healthcheckPath` displays `/-/healthy` and `dockerfilePath` displays `Dockerfile`.
8. Click **Redeploy** (or run `npx @railway/cli redeploy --service opspilot-prometheus`).

#### B. Resolve Neon Database Quota Failure
1. Log into [Neon Console](https://console.neon.tech).
2. Unsuspend compute or upgrade compute time quota for project `ep-floral-block-azsrnzo6`.
3. Alternatively, update `DATABASE_URL` environment variable on `@opspilot/api` service in Railway to point to an active database instance.

---

### 5. Resolution Update — Interim Stabilization (2026-08-26)

To prevent resource exhaustion on Railway and ensure production defaults to demo data without continuous database writes, an interim stabilization patch was applied:

1. **Simulator Tick Loop Environment Gating:**
   - Updated `packages/config/src/index.ts` adding `SIMULATOR_TICK_INTERVAL_MS` to `@opspilot/config`.
   - Local development (`NODE_ENV=development`) defaults to `15000` (15 seconds), preserving 100% of existing local dev experience.
   - Production (`NODE_ENV=production`) defaults to `300000` (5 minutes = 300,000ms), reducing background database write transactions by **95%** (from 5,760 writes/day down to 288 writes/day). Setting `SIMULATOR_TICK_INTERVAL_MS=0` completely disables background tick writes.
   - Updated `apps/api/src/modules/simulator/simulator.service.ts` to support `intervalMs <= 0` cleanly.

2. **Default Telemetry Provider Gating (Mock/Demo Mode Default):**
   - Updated `packages/config/src/index.ts` and `packages/telemetry/src/index.ts` to default `TELEMETRY_PROVIDER` to `'mock'` in `production` environment out of the box.
   - Restarts and fresh deploys land on realistic demo data (`MockTelemetryProvider`) without requiring a manual `POST /telemetry/provider` call.
   - Live OTel mode remains fully functional and selectable on demand.

3. **Production Deployment Verification:**
   - Set environment variables on Railway for `@opspilot/api`: `SIMULATOR_TICK_INTERVAL_MS=300000` and `TELEMETRY_PROVIDER=mock`.
   - Pushed commit `166767b` to `origin/main` -> deployment succeeded on Railway.
   - Verified `GET /api/v1/telemetry/status` returns `providerName: "mock"` and `status: "HEALTHY"`.
   - Verified via Railway container logs that background tick write interval expanded from 15s to 300s.
   - *Note:* Platform migration decision (Render or alternative) remains separate and pending.

---

### 6. Closeout Update — Programmatic Prometheus Fix & Neon Quota Timeline (2026-08-26)

1. **Prometheus Root Directory Programmatic Fix (FIXED via API):**
   - Executed `serviceInstanceUpdate` mutation against Railway's GraphQL API (`https://backboard.railway.app/graphql/v2`) targeting service `opspilot-prometheus` (`4a5f41af-05da-4fbf-b4d6-a3239ac30d9a`) in `production` environment (`1be9afa7-9ed7-49d6-ae22-8c35323b6a2b`).
   - `rootDirectory` was successfully updated from `null` to `"apps/prometheus"`.
   - Verified via GraphQL introspection query `query { serviceInstance { rootDirectory } }` returning `"apps/prometheus"`.
   - Redeployed `opspilot-prometheus`. (Note: Since `opspilot-prometheus` uses image `prom/prometheus:v2.51.0`, it serves TSDB directly).

2. **Neon Database Quota Status & Reset Timeline (VERIFIED):**
   - **Current Connection Test (2026-08-26T16:56:55+05:30):** STIL QUOTA-SUSPENDED (`ERROR: Your account or project has exceeded the compute time quota. Upgrade your plan to increase limits`).
   - **Automatic Quota Reset Timeline:** **September 1, 2026 at 00:00 UTC** (1st of next calendar month).
   - **Action Required for Immediate Database Access:** Manual intervention from Aditya is required if database un-suspension is needed before Sept 1 (unsuspend in Neon Console or point `DATABASE_URL` to new DB instance).


