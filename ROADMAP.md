# Roadmap

Status legend: ✅ shipped · 🔜 next · ⛔ out of scope.

## ✅ Built (shipping in production)

**Platform**
- ✅ Multi-tenant core, NextAuth (Credentials/Argon2id, Google, Entra), sessions.
- ✅ MFA: TOTP + WebAuthn/passkeys.
- ✅ DB-backed RBAC (permissions catalog, per-org roles), immutable audit log.
- ✅ Vault envelope encryption (AES-256-GCM + KMS), reveal/copy audit, sharing,
  rotation, emergency access, bulk import.
- ✅ File storage adapter (GCS/local), email (SMTP), notifications (in-app/email/LINE).
- ✅ Reports: CSV/XLSX/PDF (Thai-capable), per-module builders.
- ✅ Docker + GCP Cloud Run CI/CD (build → migrate job → release).

**IT Asset Management**
- ✅ Inventory, categories, assignment/return/transfer, lifecycle, warranty,
  depreciation, CSV/XLSX import, QR labels + public scan page.

**Asset Borrowing & Return**
- ✅ Request → **single IT approval** → issue/handover → return/inspection.
- ✅ Auto Ref No. `IT-BR-YYYY-0001`, requester auto-populate, multi-asset select.
- ✅ Separation-of-duties, row-locked state changes, partial returns
  (normal→Available, damaged→Repair, lost→Lost).
- ✅ A4 **company-form PDF** (Print + Download) rendered from the DB, pre-filled signers.
- ✅ QR quick-actions (Borrow/Issue/Return/View/History), overdue reminders,
  borrow/overdue/utilization reports.
- ✅ Notifications routed to the **IT Manager**.

**IT Support (ITSM)**
- ✅ Case intake, priority/impact/urgency, SLA policies + business hours/holidays,
  team auto-assignment, work logs, resolution, CSAT, KPI dashboards, email signatures.

**CCTV Monitoring**
- ✅ Recorder/camera health, storage/retention/gap/daily reports, incidents,
  collector-agent ingest, on-demand "Check Now", snapshot upload.

**People / Ops**
- ✅ Employees/departments/locations, HR push-sync + employee↔user link reconcile,
  onboarding/offboarding boards.
- ✅ Procurement (SoD approval), vendors, licenses, subscriptions, maintenance, contracts.
- ✅ ITIL/infra: Change, Problem, KB, Vulnerabilities, CMDB, Service Catalog,
  Backup/DR, Monitoring, Endpoint posture, Network/IPAM.

## 🔜 Next (candidates, not committed)

- 🔜 **Digital signatures** on the borrow form (schema is already signature-ready).
- 🔜 **Configurable borrow approval chain** (UI to add Manager/Management steps back).
- 🔜 **LINE / richer notification channels** and per-user notification preferences.
- 🔜 **Reservations & date-conflict prevention** for future-dated borrow bookings.
- 🔜 Tighter, per-route **CSP** (move off report-only baseline).
- 🔜 **Rate limiting** on auth/ingest; automated ingest/cron key rotation.
- 🔜 Deeper **reporting/analytics** (utilization trends, cost, forecasting).
- 🔜 CCTV live/relay transport research (currently health/metadata only).
- 🔜 Broader automated **test coverage** (unit + E2E per module).

## ⛔ Explicitly out of scope

- ⛔ Public/customer-facing portal (internal tool only).
- ⛔ Native mobile apps (web is mobile-friendly; QR pages are phone-optimized).
- ⛔ Financial accounting / general ledger.
- ⛔ Real-time video streaming or recording (CCTV = health/metadata only).
- ⛔ Row-level DB security policies (tenancy is app-enforced by design).
