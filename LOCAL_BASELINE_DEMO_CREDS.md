# OpsPilot AI — Local Baseline Demo Credentials

**Purpose:** This document records the default seeded demo accounts available for local evaluation and interactive UI demo flows.

> **LOCAL / DEMO USE ONLY**  
> These credentials are strictly intended for local dev, evaluation, and interactive UI testing. They MUST NOT be used or deployed in production environments.

---

## 1. Seeded Demo Accounts (Local Dev Baseline)

The database seed script (`scripts/seed.ts`) automatically provisions four demo accounts matching OpsPilot's four RBAC roles:

| Username | Plaintext Password | RBAC Role | Intended Permissions |
|---|---|---|---|
| `viewer` | `OpsPilot2026!viewer` | `VIEWER` | Read-only access to incidents, alerts, services, metrics |
| `sre` | `OpsPilot2026!sre` | `SRE_OPERATOR` | Threshold rules, incident state transitions, drift management |
| `commander` | `OpsPilot2026!commander` | `INCIDENT_COMMANDER` | Remediation execution, chaos injection, emergency override |
| `admin` | `OpsPilot2026!admin` | `SECURITY_ADMIN` | Telemetry pipeline mode, system configuration |

---

## 2. Password Hashing Architecture
- **Algorithm:** Argon2id (`argon2` package)
- **Salt & Memory:** Managed dynamically per OWASP defaults via Argon2id.

---

## 3. Production Deployment Note (Railway)
The seed script `pnpm db:seed` auto-runs during local Docker Compose startup.  
Production deployments on Railway **do not** automatically run seed scripts on deployment.

**Action required for Railway production:**
Execute a one-time manual seed command or run `pnpm db:seed` via Railway CLI / console with customized production passwords.
