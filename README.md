# ITBox — Enterprise IT Management System

ระบบบริหารจัดการไอทีองค์กรแบบครบวงจร: IT Asset Management + Password/Secret
Vault + Software License + Subscription + Maintenance + Procurement +
Offboarding + Audit + Security Center ในระบบเดียว (multi-tenant)

**Stack**: Next.js 15 (App Router) · TypeScript · Tailwind CSS + shadcn-style UI ·
PostgreSQL + Prisma · Auth.js (Argon2id credentials + Google OAuth + TOTP MFA) ·
AES-256-GCM envelope encryption + Google Cloud KMS · Cloud Run / Cloud SQL /
Cloud Storage / Secret Manager / Artifact Registry

ภาษาไทยเป็นค่าเริ่มต้น สลับ English ได้จาก Top bar · Dark/Light mode ·
Mobile-first responsive

## Feature highlights

- **Assets**: ทะเบียนทรัพย์สิน, lifecycle (register→assign→transfer→repair→
  retire→dispose), check-in/check-out, ประวัติทุกขั้นตอน, QR code + สติกเกอร์
  พิมพ์ได้ + หน้า public scan, CSV export
- **Password Vault**: เข้ารหัสรายการละ 1 DEK (AES-256-GCM) ห่อกุญแจด้วย
  Cloud KMS, reveal/copy พร้อม MFA policy ตามระดับชั้นความลับ
  (LOW→CRITICAL), แชร์แบบมีวันหมดอายุ (user/role/department), temporary
  access, emergency break-glass พร้อม approval, rotation tracking, password
  generator + strength meter, **Asset ↔ Credential linking** (เปิดหน้า
  Server เห็นทันทีว่ามี credential อะไรเกี่ยวข้อง โดยสิทธิ์แยกรายการ)
- **RBAC**: 11 บทบาท × สิทธิ์ราย resource:action แก้ไขได้จาก UI + audit ทุก mutation
- **Business**: licenses + seat assignment, subscriptions, vendors,
  maintenance tickets (ผูกสถานะเครื่องอัตโนมัติ), purchase request +
  3-step approval (Manager→IT→Finance), IT offboarding console
  (คืนทรัพย์สิน/เพิกถอนไลเซนส์/เพิกถอน vault/ปิดบัญชี)
- **Monitoring**: dashboard + charts, reports (CSV, ป้องกัน formula
  injection), audit log viewer, security center, in-app + LINE notifications

## Local development

Requirements: Node.js 22+, PostgreSQL 16

```bash
# 1. Install
npm ci

# 2. Database (or use docker compose up db)
createdb itbox   # or: docker compose up -d db

# 3. Environment
cp .env.example .env
# set DATABASE_URL, AUTH_SECRET (openssl rand -base64 32),
# KMS_PROVIDER=local, LOCAL_KMS_MASTER_KEY (openssl rand -base64 32),
# SEED_ADMIN_PASSWORD, SEED_USER_PASSWORD

# 4. Migrate + seed
npm run db:migrate
npm run db:seed

# 5. Run
npm run dev            # http://localhost:3000
```

Demo users (passwords = seed env vars):
`admin@example.com` (SUPER_ADMIN), `itmanager@example.com`,
`itstaff@example.com`, `security@example.com`, `hr@example.com`,
`employee@example.com` — vault seed records are **FAKE demo values**.

### Verify
```bash
npm run lint && npm run typecheck && npm test && npm run build
npm run test:e2e   # Playwright E2E (starts its own dev server on :3400)
```

## Docker

```bash
docker compose up --build   # app on :8080 + PostgreSQL 16
```

## Production on GCP

Follow **docs/gcp-deployment.md** step-by-step: project/APIs → Cloud SQL
(+PITR backup) → Cloud Storage buckets → **Cloud KMS key ring** → Secret
Manager → Artifact Registry + service account IAM → `gcloud builds submit`
(build → migrate → deploy Cloud Run) → domain + SSL → Cloud Scheduler for
`/api/cron/checks` → monitoring/logging. Backup/restore and DR runbooks:
docs/backup-restore.md, docs/disaster-recovery.md.

Production rules enforced by the app:
- `KMS_PROVIDER=local` refuses to start in production — Cloud KMS required.
- All secrets from Secret Manager (no secrets in code/image; `.env` gitignored;
  CI runs gitleaks + dependency audit).

## Security model (summary)

- User login passwords → **Argon2id hash** (never recoverable, never plaintext).
- Vault secrets → **AES-256-GCM + KMS envelope encryption** (recoverable by
  authorized reveal only). No master password is stored anywhere.
- Reveal chain: authn → RBAC → per-item ACL → MFA (HIGH/CRITICAL) → approval
  (break-glass) → decrypt → audit (value never logged) → auto-hide 30s.
- Sessions: JWT + revocable DB record, 8h absolute timeout, logout-all.
- Full details: docs/security.md, docs/password-vault.md.

## Documentation

| File | Content |
|---|---|
| docs/architecture.md | System + GCP architecture, layers, scalability |
| docs/database.md | Schema groups, ERD, encrypted columns, migrations |
| docs/api.md | REST endpoints + permissions |
| docs/security.md | AuthN/AuthZ, sessions, headers, audit, secrets |
| docs/password-vault.md | Envelope encryption, reveal chain, sharing, break glass |
| docs/gcp-deployment.md | Step-by-step production deployment |
| docs/backup-restore.md / disaster-recovery.md | Backups, PITR, RPO/RTO runbooks |
| docs/pdpa.md | Personal-data handling |
| docs/user-manual.md / admin-manual.md | คู่มือใช้งาน (ไทย) |
| docs/CONVENTIONS.md | Coding conventions |

## Implementation status

Implemented end-to-end (UI + API + DB + validation + authorization + audit):
assets/lifecycle/assignment/QR, vault (encrypt/reveal/copy/share/rotate/
emergency/favorites/classification/MFA), employees/departments/locations,
licenses/subscriptions/vendors/maintenance/procurement+approvals,
offboarding, dashboard/reports/audit/security center, notifications (in-app +
**Email/SMTP** + LINE broadcast), users/roles/permissions/sessions/profile/MFA
enrollment, **file uploads** (asset documents & images → Cloud Storage in
production, local disk in dev, org-scoped download route),
**asset bulk import** from CSV **and Excel (.xlsx)** with template download +
row-level error report, **report export in CSV / Excel (.xlsx) / PDF**
(PDF with embedded Thai font, capped at 1,000 rows by design),
**WebAuthn/Passkey MFA** (Touch ID / Windows Hello / security keys as an
alternative factor to TOTP for HIGH/CRITICAL vault reveals),
Google OAuth + **Microsoft Entra ID** SSO (env-gated), REST API,
tests (unit + DB integration incl. cross-tenant & encryption-at-rest
assertions) + **Playwright E2E suite**, Docker/Cloud Build/GitHub Actions CI.

**Scope notes** (declared per Section 72):
- Login-time MFA uses TOTP; passkeys cover vault step-up verification
  (passkey-at-login can be added on the same WebAuthn tables)
- PDF export truncates at 1,000 rows (use CSV/XLSX for full data — noted in
  the file itself)

## License

Internal enterprise use. UI/branding เป็นงานออกแบบใหม่ทั้งหมด ไม่ได้คัดลอก
เครื่องหมายการค้าหรือแบรนด์ใด
