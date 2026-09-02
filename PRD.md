# Product Requirements Document — TECHCORE (ITBox)

## 1. What this is

**TECHCORE / ITBox** is an internal **Enterprise IT Management System** for
Chaithanin Co., Ltd. It consolidates the IT department's day-to-day operations —
asset lifecycle, a password vault, a help desk, CCTV health monitoring, and an
IT-asset borrow/return workflow — into a single multi-tenant web application.

- **Live URL:** https://itbox-ppjbzqdu3q-as.a.run.app
- **Stack:** Next.js 15 (App Router) · React 19 · Prisma 6 · PostgreSQL 16 · NextAuth v5
- **Hosting:** Google Cloud Run (project `itbox-505402`, region `asia-southeast1`)
- **Tenancy:** multi-tenant, isolated by `organizationId` on every row.

## 2. Who it's for

| Persona | Needs |
|---|---|
| **IT Staff** | Register/assign assets, resolve support cases, issue & receive borrowed equipment, run CCTV checks. |
| **IT Manager** | Approve borrow requests & purchases, oversee SLA/KPIs, manage licenses/contracts. |
| **Employees / Requesters** | Open support cases, request to borrow IT assets, view their assigned assets. |
| **Department Managers** | Approve procurement, review their team's requests. |
| **HR** | Keep the employee master current (HR push sync), drive onboarding/offboarding. |
| **Security / Auditors** | Read audit trails, vault access logs, security posture. |
| **Administrators** | Manage users, roles, and system settings. |

## 3. Core capabilities (in scope)

- **IT Asset Management** — inventory, categories, assignment/return/transfer, lifecycle (retire/dispose), warranty & depreciation, CSV/XLSX import, QR labels.
- **Asset Borrowing & Return** — request → single IT approval → issue/handover → return/inspection, with an A4 company-form PDF, QR quick-actions, and overdue reminders.
- **Password Vault** — envelope-encrypted (AES-256-GCM) secrets, reveal/copy with audit, sharing, rotation, emergency access, bulk import.
- **IT Support (ITSM)** — case intake, priority/impact/urgency, SLA policies, team auto-assignment, work logs, satisfaction (CSAT), KPI dashboards, email signatures.
- **CCTV Monitoring** — recorder/camera health, storage & retention checks, incidents, daily reports, collector-agent ingest.
- **People** — employees, departments, locations; HR push-sync; onboarding/offboarding boards.
- **Procurement & Vendors** — purchase requests with separation-of-duties approval, vendor directory.
- **Licenses, Subscriptions, Maintenance, Contracts** — renewals & expiry alerts.
- **ITIL modules** — Change, Problem, Knowledge Base, Vulnerabilities, CMDB, Service Catalog, Backup/DR, Monitoring, Endpoint posture.
- **Reports** — CSV / XLSX / PDF exports across modules (Thai-capable PDF).
- **Platform** — RBAC, immutable audit log, notifications (in-app/email/LINE), scheduled jobs, API-key ingest pipelines.

## 4. Out of scope (today)

- Public/customer-facing portal (this is an internal tool).
- Native mobile apps (the web UI is mobile-friendly; QR pages are optimized for phones).
- Financial accounting / general ledger (procurement stops at request/approval).
- Real-time video streaming (CCTV module tracks **health/metadata only**, never video).
- Automated hardware discovery/agents beyond the provided collector scripts.
- SSO beyond Google Workspace / Microsoft Entra (both optional).

## 5. Non-functional requirements

- **Security:** Argon2id password hashing, envelope-encrypted secrets, RBAC on every action, immutable audit trail, PDPA-aware handling of personal data.
- **Tenancy:** every query is scoped by `organizationId`; cross-tenant reads return 404.
- **Reliability:** stateless containers on Cloud Run; DB is the single source of truth; migrations gate each deploy.
- **Auditability:** every state-changing action writes an `AuditLog` row and, where relevant, entity history (e.g. `AssetHistory`).
- **i18n:** Thai/English bilingual UI and documents.

## 6. Success criteria

- IT can run asset, borrow, support, and CCTV workflows end-to-end without spreadsheets.
- Borrow requests produce a printable A4 form matching the company's official layout.
- No cross-tenant data leakage; all privileged actions are permission-gated and logged.
- Deploys are one-click (push to branch → build → migrate → release).

See `ROADMAP.md` for what's built vs. next, and `ARCHITECTURE.md` for how it's built.
