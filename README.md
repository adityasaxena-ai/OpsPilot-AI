# OpsPilot AI 🚀

> **From Alert to Autonomous Resolution** — An AI-Native IT Operations & SRE Control Tower for Microservice Incident Management, Multi-Agent Root Cause Analysis, Governed Remediation, and Metric Recovery Verification.

[![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue.svg)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61dafb.svg)](https://reactjs.org/)
[![Fastify](https://img.shields.io/badge/Fastify-4-black.svg)](https://www.fastify.io/)
[![Prisma](https://img.shields.io/badge/Prisma-5-2D3748.svg)](https://www.prisma.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg)](https://redis.io/)
[![OpenTelemetry](https://img.shields.io/badge/OpenTelemetry-Compatible-008080.svg)](https://opentelemetry.io/)
[![Deployment](https://img.shields.io/badge/Deploy-Free--Tier%20Cloud-success.svg)](./DEPLOYMENT.md)

---

## 📑 Table of Contents

- [Overview](#overview)
- [Monorepo Architecture](#monorepo-architecture)
- [Public Cloud Deployment (Free Tier)](#public-cloud-deployment-free-tier)
- [Local Quick Start](#local-quick-start)
- [Telemetry Providers (Live OTel, Mock, Replay)](#telemetry-providers-live-otel-mock-replay)
- [Incident Detection & Correlation Engine](#incident-detection--correlation-engine)
- [Autonomous SRE AI Agent Suite](#autonomous-sre-ai-agent-suite)
- [Governed Remediation & 0-100 Risk Engine](#governed-remediation--0-100-risk-engine)
- [Documentation & Deployment Guide](#documentation--deployment-guide)

---

## 🌟 Overview

OpsPilot AI combines Observability, AIOps, Autonomous SRE Agents, Risk Management, Policy-based Safety Guardrails, Human Approval Workflows, and Blameless Postmortems into a unified IT Operations Control Tower.

### Key Capabilities

1. **Multi-Source Telemetry Pipeline**:
   - Live OpenTelemetry Prometheus Scraper (`:9090`), Telemetry Replay Engine, and Standby Mock Telemetry Provider.
2. **Detection & 5-Criteria Alert Correlation**:
   - Threshold Rule Engine (`cpuPercent > 85%`, `errorRate > 5%`, `latencyP99 > 1500ms`), 15-min Redis deduplication, and 5-criteria point-scoring correlation algorithm.
3. **Autonomous SRE AI Agent Suite**:
   - `TriageAgent`: P1–P5 severity classification and business impact estimation.
   - `EvidenceCollector`: Multi-source telemetry metrics, log traces, deployment commits, and past resolution logs.
   - `InvestigationAgent`: Findings synthesis, component ranking, and chronological timeline reconstruction.
   - `KnowledgeAgent`: Active runbook matching based on service topology.
   - `RCAAgent`: Probable root cause determination & prioritized remediation action recommendations.
   - `VerificationAgent`: Post-remediation metric recovery verification.
   - `PostmortemAgent`: Blameless postmortem generation upon incident resolution.
4. **Governed Autonomous Remediation**:
   - `RiskEngine`: Quantitative 0–100 risk score based on 6 operational factors (Business Criticality, Blast Radius, Irreversibility, Environment, AI Uncertainty, Historical Failure Rate).
   - `PolicyEngine`: Max autonomous risk ceiling rules and human-in-the-loop approval triggers.
   - `RemediationExecutor`: 7-layer guard chain executing 5 remediation tools (`ROLLBACK_DEPLOYMENT`, `RESTART_SERVICE`, `SCALE_SERVICE`, `CLEAR_CACHE`, `RETRY_BATCH`).
5. **Web Control Tower UI**:
   - Real-time Command Center (`http://localhost:3000`), Chaos Lab failure simulator, Incident Detail with RCA alert cards, Evidence Pool, Governed Approval controls, Interactive AI Copilot Chat Drawer, and Settings page.

---

## 🏗️ Monorepo Architecture

The repository is structured as a TypeScript monorepo using **pnpm workspaces** and **Turborepo**:

```text
/Users/pankaja/AI Projects/OpsAI
├── apps/
│   ├── api/            # Fastify 4 REST & SSE Backend Server (Port 3001)
│   └── web/            # React 18 / Vite / Tailwind Control Tower UI (Port 3000)
├── packages/
│   ├── types/          # Domain schemas & Zod validators
│   ├── config/         # Environment loader & Zod config schema
│   ├── telemetry/      # Telemetry Provider Abstraction (OTel, Replay, Mock)
│   ├── detection/      # RuleEngine, CorrelationEngine, LifecycleManager, ImpactAnalyzer
│   ├── ai/             # Gemini API Provider & SRE Mock Provider
│   ├── agents/         # Autonomous SRE AI Agents Suite
│   ├── policy-engine/  # Deterministic Policy Engine
│   ├── risk-engine/    # 0-100 Quantitative Risk Engine
│   └── remediation/    # Executable Tool Registry & Safety Guard Chain
├── prisma/
│   ├── schema.prisma   # PostgreSQL Prisma Schema (18 models, 14 enums)
│   └── migrations/     # Version-controlled SQL migrations
├── scripts/
│   └── seed.ts         # Database Seeding script
```

---

## ☁️ Public Cloud Deployment (100% Free Tier)

OpsPilot AI is configured for easy zero-cost deployment to public cloud services for demonstrations and learning:

- **Frontend**: [Vercel Free Tier](https://vercel.com) (`https://opspilot-web.vercel.app`)
- **Backend API**: [Railway Free Tier](https://railway.app) / [Render Free Tier](https://render.com) (`https://opspilot-api.up.railway.app`)
- **Database**: [Neon Managed Serverless PostgreSQL](https://neon.tech)
- **Redis Cache**: [Upstash Managed Serverless Redis](https://upstash.com)

👉 **For complete step-by-step instructions, view the [`DEPLOYMENT.md`](./DEPLOYMENT.md) guide.**

---

## 💻 Local Quick Start

### 1. Prerequisites
- **Node.js**: v20.0.0 or higher
- **pnpm**: v9.0.0 or higher (`npm install -g pnpm`)
- **Docker** (Optional for live PostgreSQL / Redis): Docker Desktop

### 2. First-Time Setup Sequence

```bash
# 1. Clone the repository
git clone https://github.com/your-username/opspilot-ai.git
cd opspilot-ai

# 2. Install dependencies across all 11 workspace packages
pnpm install

# 3. Start local Docker containers for PostgreSQL and Redis
docker-compose up -d

# 4. Copy environment file
cp .env.example .env

# 5. Push Prisma Schema to database
pnpm db:push

# 6. Seed initial microservices, topology, and default threshold rules
pnpm db:seed

# 7. Start API backend and Web frontend dev servers
pnpm dev
```

The application will be accessible at:
* 🌐 **Web Control Tower UI**: [http://localhost:3000](http://localhost:3000)
* ⚙️ **Fastify API Server**: [http://localhost:3001](http://localhost:3001)

---

## 📄 Documentation Links
* 📘 [Deployment Guide (`DEPLOYMENT.md`)](./DEPLOYMENT.md) — Step-by-step public cloud deployment guide.
* 📕 [Phase 1 Validation Report](./phase1_validation_report.md) — OpenTelemetry & Telemetry Replay Mode signoff.
* 📙 [Implementation Plan](./implementation_plan.md) — Architectural design specs.

---

## 📝 License

Distributed under the MIT License. See `LICENSE` for more information.
