# GCP Deployment Report

_Snapshot of what is actually running, and how it was verified._

## Live deployment

| Item | Value |
|---|---|
| **Live URL** | https://itbox-ppjbzqdu3q-as.a.run.app |
| **Platform** | Google Cloud Run (fully managed) |
| **GCP project** | `itbox-505402` |
| **Region** | `asia-southeast1` (Singapore) |
| **Service** | `itbox` |
| **Migrate job** | `itbox-migrate` (runs `prisma migrate deploy` before each release) |
| **Database** | Cloud SQL for PostgreSQL 16 (Cloud SQL socket) |
| **Runtime** | Node 22-slim, Next.js 15 standalone (`node server.js`) |
| **Deployed branch** | `claude/enterprise-it-management-system-pz0u9s` (and `main`) |
| **Latest release** | deploy run **#109**, commit `710a292` — **success** |
| **Verified (UTC)** | 2026-09-02 |

## What is running

The full ITBox application: Assets, **Borrow & Return**, Vault, Support (ITSM),
CCTV monitoring, People (employees/departments/locations + HR sync),
Procurement/Vendors, Licenses/Subscriptions/Maintenance/Contracts, the ITIL/infra
suite (Change/Problem/KB/Vuln/CMDB/Catalog/Backup/Monitoring/Endpoints/Network),
Reports, Notifications, Audit, Security, and Settings.

- **86** Prisma models, **24** DB migrations applied (through
  `20260902130000_borrow_permissions_grant`).
- **86** RBAC permission keys across **11** system roles.

## CI/CD pipeline (verified)

Workflow `.github/workflows/deploy.yml` on push. Each run performs, in order and
all **green** on the latest release:

1. Authenticate to GCP via Workload Identity Federation (OIDC; no static keys).
2. Build the image with Cloud Build (`deploy/cloudbuild-ci.yaml`).
3. **Apply database migrations** — `gcloud run jobs execute itbox-migrate --wait`.
4. **Deploy** the service image-only (env/secrets/Cloud SQL wiring preserved).
5. Emit the service URL.

Recent releases confirmed green (via GitHub Actions run conclusions):

| Run | Commit | Summary | Result |
|---|---|---|---|
| #109 | `710a292` | seed includes `borrow:*` | ✅ build + migrate + deploy |
| #108 | `4fdc816` | single-step IT approval | ✅ |
| #107 | `f2edde5` | decision hidden-input fix + IT_MANAGER notifications | ✅ (migrate 09:29→09:30, deploy 09:30) |
| #102 | `b133f7c` | borrow permission grant migration + form-match PDF | ✅ (migrate applied) |
| #100/#101 | borrow module | `20260902120000_borrow_return_module` applied | ✅ |

## Verification performed

- **Migrations:** the `20260902120000_borrow_return_module` and
  `20260902130000_borrow_permissions_grant` migrations applied cleanly in the
  pipeline (the enum `ADD VALUE` ran in-transaction on PG 16 without error), and
  independently against a fresh local PostgreSQL 16 (all 24 migrations).
- **Borrow workflow (E2E):** reproduced against a local production standalone build
  with a seeded DB and headless Chromium — create → submit → `PENDING_IT`
  (single IT approval row) → approve → `READY_TO_ISSUE`. The A4 PDF renders exactly
  2 pages; QR and report exports return 200 with correct content types.
- **Full-system smoke crawl:** ~78 routes across every module loaded as an admin
  with **0 server-side exceptions** (the only flags were correct multi-tenant 404s
  for a cross-org id). `typecheck`, `lint`, and `build` all clean.

## Scheduled jobs

Cloud Scheduler → Cloud Run (POST with `Authorization: Bearer $CRON_SECRET`):
`/api/cron/checks` (daily), `/api/cron/sla` (5–15 min), `/api/cron/cctv-daily`
(daily). Confirm these exist in Cloud Scheduler for the reminder/SLA features to
run.

## Operational notes

- The build/CI environment cannot always reach the running service directly (org
  network policy); status is confirmed via the pipeline conclusions and Cloud
  Logging rather than direct HTTP from CI.
- After a redeploy, browser tabs left open may hit a transient server-action
  version-skew error; a full page reload resolves it.
- `prisma/seed.ts` does **not** run during deploys (only `migrate deploy` does);
  seeding is a manual, non-prod operation.

## Post-deploy checklist

- [ ] GitHub Actions latest `Deploy to Cloud Run` run is green.
- [ ] `gcloud run services describe itbox --region asia-southeast1` shows the new revision serving 100%.
- [ ] Cloud Scheduler jobs for `/api/cron/*` exist and carry `CRON_SECRET`.
- [ ] Ingest API keys (`hr.ingest`, `itreport.ingest`, CCTV, …) are set in Settings.
- [ ] Secret Manager holds `AUTH_SECRET`, `CRON_SECRET`, DB URL, KMS/SMTP config.
