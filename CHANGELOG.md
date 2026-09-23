# Changelog

Notable changes, newest first. Dates are approximate to the build history.
The project is continuously deployed; each entry maps to one or more commits on
the active branch.

## 2026-09 — Access-request documents, HR sync fields, device passcode

**Added**
- **Access-request document module (form 4.A)** — ERP per-menu permission matrix
  (15 modules + Online Marketing + Venio + Horganice), Staff-ID auto-fill
  (`/api/doc-forms/lookup`), default-value presets, **recommended RBAC default
  profiles** (25 profiles generated from the company matrix), and a
  **selected-only PDF** (`/api/doc-forms/access-matrix-pdf`) where Print === PDF.
- **Document approval workflow** — records sign-offs (Dept Manager / IT Support /
  IT Manager / Management) with name + date + reject reason on the request;
  manager approval advances SUBMITTED→APPROVED. Print a saved request with the
  captured signatures via `/api/access-requests/[id]/pdf`. **Document-only —
  grants no real access.**
- **Access-request register report** (`/api/reports/access-requests`) + list
  export/status summary, and an **Access Review** recertification report
  (`/reports/access-review`, `access-review` export key).
- **Positions master + default-permission profiles** (document-only) and an
  employee Access panel that drafts a request from the matched profile.
- **Device lock passcode** on assets — stored in the Vault (HIGH,
  `device-lock` tag) and linked via `AssetVaultLink`; masked, audited reveal.
- **Import linking** — Vault and SIM imports accept an optional `assetTag`
  column to auto-link secrets / SIMs to their asset.
- **Integrations settings** — reveal (KMS-decrypt), rotate, and **Test
  connection** for the collector / HR sync keys.
- Live/debounced search across list pages; reports overhaul
  (Dashboard→Summary→Chart→Alert→Detail, server-rendered charts).

**Changed**
- **HR employee sync** now carries `nickname` + `phone` + start date; the
  receiver stores them and forms auto-fill them. Ingest keys are additionally
  **KMS-encrypted at rest** so they can be revealed again without rotating.
- Access-request Ref No auto-generates `REQ{DDMMYY}-{NN}` (Bangkok-day
  sequence); signature date lines dropped the `DD/MM/YYYY` literal.

**Fixed**
- Granted `accessreq:read` / `accessreq:manage` / `permprofile:manage` to
  existing orgs' roles via migration (gated access-request pages 500'd even for
  SUPER_ADMIN); added an access-requests segment error boundary.

## 2026-09-02 — Asset Borrowing & Return + hardening

**Added**
- **IT Asset Borrowing & Return module** (`feat(borrow): …`):
  - Prisma models (`BorrowRequest`, `BorrowRequestItem`, `BorrowApproval`,
    `AssetIssueRecord`/`Item`, `AssetReturnRecord`/`Item`, `AssetConditionPhoto`,
    `DigitalSignature`) + enums; `AssetStatus` gains `RESERVED`/`BORROWED`.
  - Workflow engine: auto Ref No. `IT-BR-YYYY-0001`, requester auto-populate,
    approval → issue/handover → return/inspection with row-locked transitions,
    partial returns, SoD.
  - UI: dashboard (KPIs/filters), create wizard (searchable requester + multi-asset),
    request detail with approval timeline and inline approve/issue/return, and
    approvals/issue/returns worklists.
  - **A4 company-form PDF** (Print + Download) rendered from the DB with pre-filled
    signers; QR quick-actions on the scan page; borrow/overdue/utilization reports;
    due-soon/overdue reminder cron.
- **Employees:** on-demand **Sync** button to reconcile employee↔user links.

**Changed**
- Borrow approval reduced to a **single IT step** (was Manager→IT→Management);
  initial status derives from the chain's first step.
- Borrow notifications routed to the **IT Manager** role only (submit, approvals,
  and due/overdue reminders).
- Borrow PDF reworked to match the official company form exactly (Section 1
  fields 1–7, exact signature labels, numbered asset list); renders exactly 2 pages.

**Fixed**
- **Approve crashed with a white screen** — a submit button's `name`/`value` is not
  delivered to a Server Action in this Next/React version, so `decision` arrived
  null and Zod threw. Decision & submit-intent now travel in hidden inputs.
- Granted `borrow:*` to existing orgs' roles via migration (menu was hidden);
  synced `prisma/seed.ts` so fresh orgs get them too.
- Borrow segment error boundary + fully-wrapped actions surface real errors
  instead of a generic white screen.
- Asset picker dropdown now closes on empty query.

## 2026-09-01 — Pre-production audit remediation (Phase 0)

- Constant-time `CRON_SECRET` comparison (AUTH-010).
- Procurement separation-of-duties with row locks; friendlier employee-delete flow.
- Password-reuse prevention (`User.passwordHistory`), report-only CSP.
- Foreign-key / report-filter indexes (DB-004); soft-delete link cleanup.
- Asset input validation, SLA resolution notes, IDOR-lite hardening, MFA lockout.

## 2026-08-31 — HR integration

- HR push-sync with a **dedicated ingest key**; deterministic employee↔user
  matching by `employeeCode` (with name disambiguation) + match-report diagnostic;
  API-key auth for the link-users endpoint.

## 2026-08 — Enterprise & monitoring modules

- CCTV monitoring (schema, ingest API, collector agent, dashboards, settings,
  reports, incidents, snapshots).
- ITIL/security suite: Change, Problem, KB (docx import), Vulnerabilities, CMDB,
  Service Catalog, Backup/DR, Monitoring, Endpoint posture, Onboarding.
- Preventive maintenance, audit fixes, enterprise-module permission grants.

## 2026-08-13 — IT Support (ITSM)

- Support cases, types/categories, SLA policies, teams & auto-assignment, work
  logs, satisfaction, KPI dashboards, email signatures; self-service + agent portals.

## 2026-08-12 — Foundation

- Initial schema and app scaffold; NextAuth (Credentials/Google) + TOTP + sessions;
  RBAC + audit + tenant-scoped services; **vault** envelope encryption (AES-256-GCM
  + KMS); core asset lifecycle + QR; supporting modules (employees, departments,
  licenses, subscriptions, vendors, maintenance, procurement, notifications,
  offboarding); dashboards, reports, audit viewer, security center; storage + file
  upload; email + Entra; CSV/XLSX import; Playwright E2E; **WebAuthn/passkeys**;
  XLSX/PDF report export; vault bulk import; Docker + GCP Cloud Run deploy.
