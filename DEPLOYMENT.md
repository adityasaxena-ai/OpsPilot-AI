# OpsPilot AI — Free-Tier Public Cloud Deployment Guide

This guide provides step-by-step instructions for deploying **OpsPilot AI** to the public cloud using **100% free-tier services**. This deployment setup is ideal for public learning, live demonstrations, and portfolio showcases.

---

## 🏗️ Deployment Architecture & Free Services

```text
  ┌──────────────────────────────────────────────────────────────────┐
  │                 1. FRONTEND: Vercel Free Tier                    │
  │  - React 18 + Vite SPA                                           │
  │  - URL: https://opspilot-web.vercel.app                          │
  └────────────────────────────────┬─────────────────────────────────┘
                                   │ HTTPS API Requests (CORS enabled)
                                   ▼
  ┌──────────────────────────────────────────────────────────────────┐
  │              2. BACKEND API: Railway / Render Free Tier          │
  │  - Fastify 4 Node.js Server (Port 3001)                          │
  │  - URL: https://opspilot-api.up.railway.app                      │
  └─────────────────┬───────────────────────────────┬────────────────┘
                    │                               │
                    ▼                               ▼
  ┌─────────────────────────────────┐   ┌─────────────────────────────────┐
  │ 3. DATABASE: Neon Free Tier     │   │ 4. REDIS: Upstash Free Tier     │
  │ - Serverless PostgreSQL 16      │   │ - Serverless Redis 7.2          │
  └─────────────────────────────────┘   └─────────────────────────────────┘
```

| Component | Cloud Host / Service | Free Tier Limits |
| :--- | :--- | :--- |
| **Frontend Web App** | [Vercel](https://vercel.com) | Unlimited bandwidth / 100GB band / free SSL |
| **Backend Fastify API** | [Railway](https://railway.app) / [Render](https://render.com) | 512MB RAM / 100% free |
| **PostgreSQL Database** | [Neon Tech](https://neon.tech) | 0.5 GiB storage / Serverless Postgres 16 |
| **Redis Cache** | [Upstash](https://upstash.com) | 10,000 commands/day / Serverless Redis |

---

## 📋 Prerequisites & Free Account Setup

Before starting, create free accounts on the following platforms:
1. **GitHub**: Push your repository code to GitHub.
2. **Neon**: [https://neon.tech](https://neon.tech) (PostgreSQL)
3. **Upstash**: [https://upstash.com](https://upstash.com) (Redis)
4. **Railway**: [https://railway.app](https://railway.app) or **Render**: [https://render.com](https://render.com) (API)
5. **Vercel**: [https://vercel.com](https://vercel.com) (Frontend Web)

---

## 🚀 Step-by-Step Deployment Procedure

### Step 1: Provision Managed PostgreSQL on Neon
1. Log into [Neon.tech](https://neon.tech) and click **New Project**.
2. Name the project `opspilot-db` and select your nearest region.
3. Copy the pooled Connection String:
   ```text
   postgresql://opspilot_owner:YOUR_PASSWORD@ep-xyz.neon.tech/opspilot?sslmode=require
   ```

### Step 2: Provision Managed Redis on Upstash
1. Log into [Upstash.com](https://upstash.com) and click **Create Database**.
2. Name the database `opspilot-redis` and select Redis 7.
3. Copy the Redis Connection URL (`rediss://...`):
   ```text
   rediss://default:YOUR_PASSWORD@xyz.upstash.io:6379
   ```

### Step 3: Run Database Schema Push & Seed Data Locally
Run these commands from your local computer terminal to push the Prisma schema to your remote Neon PostgreSQL database and seed initial microservices, dependency graphs, and threshold rules:

```bash
# 1. Export remote database URL
export DATABASE_URL="postgresql://opspilot_owner:YOUR_PASSWORD@ep-xyz.neon.tech/opspilot?sslmode=require"

# 2. Push Prisma Schema to Neon DB
npx prisma db push --schema=prisma/schema.prisma

# 3. Seed Microservices, Rules, & Data into Neon DB
npx tsx scripts/seed.ts
```

---

### Step 4: Deploy Fastify Backend API to Railway (or Render)

#### Deployment on Railway:
1. Log into [Railway.app](https://railway.app) and click **New Project** -> **Deploy from GitHub repo**.
2. Select your `OpsAI` repository.
3. Under **Variables**, add the following environment variables:

```env
NODE_ENV=production
PORT=3001
WEB_URL=https://opspilot-web.vercel.app
API_URL=https://opspilot-api.up.railway.app
DATABASE_URL=postgresql://opspilot_owner:YOUR_PASSWORD@ep-xyz.neon.tech/opspilot?sslmode=require
REDIS_URL=rediss://default:YOUR_PASSWORD@xyz.upstash.io:6379
TELEMETRY_PROVIDER=mock
AI_PROVIDER=mock
ENABLE_AUTONOMOUS_REMEDIATION=true
SIMULATION_MODE=true
SIMULATOR_TICK_INTERVAL_MS=15000
```

4. Under **Settings**:
   - **Build Command**: `pnpm build`
   - **Start Command**: `pnpm --filter @opspilot/api start`
   - **Public Networking**: Enable domain (e.g., `opspilot-api.up.railway.app`).

---

### Step 5: Deploy React/Vite Frontend Web App to Vercel

1. Log into [Vercel.com](https://vercel.com) and click **Add New Project**.
2. Import your `OpsAI` GitHub repository.
3. Configure project settings:
   - **Framework Preset**: `Vite`
   - **Root Directory**: `./` (or `apps/web`)
   - **Build Command**: `pnpm --filter @opspilot/web build`
   - **Output Directory**: `apps/web/dist`
4. Under **Environment Variables**, add:
   ```env
   VITE_API_URL=https://opspilot-api.up.railway.app
   ```
5. Click **Deploy**.

---

## 🔍 Validation & Verification Checklist

Once both services are deployed, perform the following verification checks on your live Vercel URL (`https://opspilot-web.vercel.app`):

- [x] **Dashboard Loading**: Overview metrics and 9 microservices load without CORS errors.
- [x] **Telemetry Updates**: Metrics update smoothly every 10–15 seconds via tick loop.
- [x] **Threshold Rules**: `/rules` page loads and default threshold rules are editable.
- [x] **Chaos Simulator**: Triggering chaos (e.g. `HIGH_CPU`) on `Payments API` creates an active alert.
- [x] **Incident Detection & Correlation**: Breach converts alert into an incident with status `DETECTED`.
- [x] **AI Root Cause & Governed Remediation**: AI RCA attaches probable cause and remediation approval card.
- [x] **Telemetry Replay Mode**: Switching provider to `Replay` loops snapshot frames.

---

## 🔄 Rollback Procedure

If a bad deployment occurs:

1. **Vercel Frontend Rollback**:
   - Go to Vercel Dashboard -> **Deployments** tab.
   - Click `...` next to the previous successful deployment and select **Instant Rollback**.

2. **Railway Backend Rollback**:
   - Go to Railway Dashboard -> **Deployments**.
   - Select the previous stable commit and click **Redeploy**.

3. **Database Schema Rollback**:
   - If Prisma schema changes break production, revert schema locally and run `npx prisma db push`.

---

## 🛠️ Troubleshooting Guide

| Issue / Symptom | Probable Cause | Fix / Solution |
| :--- | :--- | :--- |
| **CORS Error in Browser Console** | `WEB_URL` in API env does not match Vercel URL | Update `WEB_URL` in Railway variables to exact Vercel frontend URL. |
| **Prisma Error P2021 (Table does not exist)** | `npx prisma db push` was not executed on Neon | Re-run `npx prisma db push` with remote `DATABASE_URL`. |
| **Redis Connection Error** | Using `redis://` instead of `rediss://` for Upstash | Upstash TLS requires `rediss://` connection string format. |
| **Vercel 404 on Page Refresh** | SPA rewrites missing | Ensure `apps/web/vercel.json` contains `{ "rewrites": [{ "source": "/(.*)", "destination": "/index.html" }] }`. |
