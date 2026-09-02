# Changelog

Notable changes, newest first. Dates are approximate to the build history.
The project is continuously deployed; each entry maps to one or more commits on
the active branch.

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
