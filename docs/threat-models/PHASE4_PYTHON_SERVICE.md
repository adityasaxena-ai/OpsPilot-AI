# Phase 4 Threat Model — Python ML Service (Foundation + Drift)
Date: 2026-11-01 | Status: APPROVED 2026-11-01, SUPERSEDED 2026-11-03 (see Decisions D4–D9) | Method: STRIDE

## Decisions
- D1 Hosting: localhost-only via docker-compose now (Option C); designed as a future separate service (Phase 10). Sidecar rejected (512 MB shared RAM; ML OOM would kill API).
- D2 Python is stateless: NO database or Redis credentials. Node owns all persistence.
- D3 Prod migrations: gated GitHub Actions `workflow_dispatch` job (protected `production` environment, manual approval) running `prisma migrate deploy` against DIRECT_URL. Must exist before any Phase 4 migration reaches prod.

## Pre-gate (complete)
- B4: confirmed no migration step in deploy (Dockerfile CMD = node only; Render Pre-Deploy locked on free tier) → fixed by D3.
- B5: Neon `_prisma_migrations` = 11/11 rows, checksums identical to local, none rolled back. Prod = local at 2580618d282ccc674e07b75ff9f78dd239120abd.

## Trust boundaries
TB1 Browser → Node API (existing JWT + RBAC)
TB2 Node API → Python service (NEW)
TB3 Python → third-party packages (NEW supply chain)
TB4 AI incident ↔ operational incident linking (NEW data relationship)

## Threats & controls
| ID | STRIDE | Threat | Control | Verification evidence |
|---|---|---|---|---|
| T1 | S | Caller other than Node invokes Python | HMAC-SHA256 over `timestamp.method.path.sha256(body)`; headers `X-OpsPilot-Timestamp` + `X-OpsPilot-Signature`; secret `ML_SERVICE_SHARED_SECRET` (distinct from JWT_SECRET); constant-time compare (`hmac.compare_digest`) | Live curl: unsigned → 401, bad sig → 401, valid → 200 |
| T2 | S/T | Replay of captured signed request | Reject timestamp skew > 300s | Live curl with 6-min-old timestamp → 401 |
| T3 | I | Python port exposed to host/network | Compose `expose` only, no `ports`; bind 0.0.0.0 inside compose network only | `docker compose ps` + host curl to port fails |
| T4 | D | Oversized/expensive drift payload exhausts CPU/RAM | pydantic schema; body ≤ 5 MB; ≤ 5,000 rows per dataset (reference and current); ≤ 20 features; 20s timeout; numeric/categorical only | Live requests over each cap → 413/422 |
| T5 | D | Repeated drift runs | Node route rate limit + RBAC; no interval scheduling (PRD A.6) | Live burst → 429; grep shows no setInterval/cron |
| T6 | I | Raw feature data / PII leaked via logs | No request-body logging in Python or Node; aggregates only in responses | Log capture during test run contains no payload values |
| T7 | T/I | Evidently HTML report returned to browser (XSS surface) | Return metrics JSON only; never render Evidently HTML | Response schema test |
| T8 | T | Malicious/vulnerable Python dependency | Pinned lockfile with hashes; `pip-audit` in CI; slim base image pinned by digest; non-root user | CI log showing pip-audit run; `docker run whoami` ≠ root |
| T9 | E | Python compromise pivots to DB | D2: no DB/Redis creds in Python env | `docker compose exec ml env` shows none |
| T10 | R | Unauthorised or untraceable AI↔ops incident link | Manual link/unlink = INCIDENT_COMMANDER+; every link/unlink → AuditLog | Live VIEWER/SRE attempt → 403; AuditLog row present |
| T11 | T | Wrong auto-link | Auto-link only if ALL hold: AI incident's GovernedAsset.serviceId is non-null; that service has a non-resolved operational incident; it started ≤ 15 min before AI incident detection; exactly ONE match. Zero or multiple matches → no auto-link, flag for manual linking by INCIDENT_COMMANDER. System actor recorded in AuditLog. | Integration tests: single match → linked; no match → not linked; two matches → not linked + flagged; null serviceId → not linked |
| T12 | D | Python down breaks drift feature | Node returns 503 ML_UNAVAILABLE; existing TS PSI kept behind flag until parity test passes on fixed fixtures | Live: stop ml container → 503, API otherwise healthy |

## Carried-over findings (owner)
- VIEWER has AI_INVESTIGATE; duplicate RBAC maps (api rbac.service.ts + web AuthContext.tsx) → Phase 4
- AI routes lack route-level rate limit → Phase 4
- Fastify trustProxy unset (rate limit may key on Render proxy IP) → reconciliation PR, verify with live request.ip logging
- Public /documentation → Phase 8
- Logins not written to AuditLog → Phase 4 (no migration needed)
- No ESLint config / lint not in CI → reconciliation PR
- tsc emits *.test.js into dist → with vitest 4 upgrade

## Out of scope
Prod deployment of Python (Phase 10), real embeddings/FAISS/Fairlearn (Phase 5).
