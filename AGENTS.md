# AGENTS.md — Context for AI agents & new engineers

> Canonical working context for the **ITBox / TECHCORE — Enterprise IT Management System**.
> `CLAUDE.md` is the Claude Code entry point and defers to this file. Keep this
> file accurate when architecture, conventions, or integrations change.

## 1. What this system is

ITBox (product name **TECHCORE**) is a multi-tenant Enterprise IT Management
System for Chaithanin Co., Ltd. It covers the IT asset lifecycle plus the
operations around it: assets, borrowing, licenses/subscriptions, procurement,
maintenance, a password **Vault**, IT service desk (ITSM), CCTV monitoring,
network/CMDB/change/problem/vulnerability, HR joiner-mover-leaver, and a
document/forms module (access-request form 4.A, etc.).

- **Users:** internal staff — IT admins/managers/staff, security, HR, finance,
  managers, employees, auditors, viewers. No external/customer login.
- **Tenancy:** every row is scoped by `organizationId`; soft delete via
  `deletedAt`; UUID primary keys; `@updatedAt` timestamps.

## 2. Tech stack

| Layer | Technology |
| --- | --- |
| Framework | Next.js 15.5 App Router (RSC + Server Actions + Route Handlers), React 19, `output: "standalone"` |
| Language | TypeScript (strict) |
| DB / ORM | PostgreSQL 16 + Prisma 6.19 |
| Auth | NextAuth v5 (beta) — credentials (Argon2id) + SSO; MFA (TOTP + WebAuthn/passkey) |
| Styling | Tailwind CSS 3.4 |
| Docs/PDF | pdfkit (A4, Thai font) · exceljs (xlsx) |
| Validation | zod |
| Tests | vitest (unit) · Playwright (e2e) |
| Deploy | Docker → Cloud Build → Cloud Run + Cloud SQL + Secret Manager (GCP project `itbox-505402`, region `asia-southeast1`, service `itbox`) |

Scale markers: **93 Prisma models**, **40 migrations**, ~40 feature modules.

## 3. Commands

```bash
npm run dev          # local dev
npm run build        # production build (also the pre-commit gate)
npm run typecheck    # tsc --noEmit
npm run lint         # next lint
npm run test         # vitest
npm run test:e2e     # playwright
npm run db:generate  # prisma generate (run after schema edits)
npm run db:migrate   # prisma migrate dev (local)
npm run db:deploy    # prisma migrate deploy (prod uses the itbox-migrate job)
npm run db:seed      # seed
npm run db:studio    # prisma studio
```

**Always verify with `npx tsc --noEmit && npm run build` before committing.**
There is no direct prod DB access from dev sandboxes.

## 4. Layout

```
prisma/schema.prisma        # 93 models — the data backbone
prisma/migrations/          # every schema change ships a migration (see §7)
src/app/(app)/<module>/     # ~40 modules: page.tsx (RSC) + actions.ts ("use server")
src/app/api/                # route handlers (ingest, reports, doc-forms, hr, cctv…)
src/lib/                    # session, permissions, prisma, audit, crypto, services/
src/lib/services/           # aggregation/business services (reports.ts, vault.ts…)
src/lib/documents/pdf.ts    # pdfkit builders (access-request 4.A, borrow, reports)
src/components/             # UI kit + charts (server-rendered) + report/ + list-controls
next.config.ts              # standalone + CSP headers + outputFileTracingIncludes (fonts)
.github/workflows/deploy.yml# auto-deploy (see §8)
```

## 5. Auth & RBAC (read before touching permissions)

- **Runtime permissions are DB-derived.** `getCurrentUser` builds
  `user.permissions: Set<string>` from `UserRole → Role → RolePermission`. The
  `ROLE_PERMISSIONS` map in `src/lib/permissions.ts` is only the *seed default*
  and the `SUPER_ADMIN: ALL` line — it does **not** grant anything at runtime.
- Gate server code with `requirePermission("perm:key")` (throws `AuthError`
  403) or check `user.permissions.has(...)` for conditional UI.
- **Adding a new permission requires a grant migration** for existing orgs
  (e.g. `*_permissions_grant/migration.sql` — insert the `permissions` catalog
  rows + `role_permissions` for the relevant roles). Without it, even
  SUPER_ADMIN lacks the permission and gated pages 500. Precedents:
  `borrow_permissions_grant`, `accessreq_permissions_grant`.
- A thrown `AuthError` on a page with no `error.tsx` renders a white
  "server-side exception". Add a segment `error.tsx` for graceful degradation.

## 6. Security constraints (hard rules)

1. **Secrets live only in the Vault** (AES-256-GCM envelope + KMS —
   `src/lib/crypto/envelope.ts`, `kms.ts`). Never store passwords, passcodes,
   API keys, or tokens in plaintext on assets, notes, or generic fields.
   - Assets link to secrets via `AssetVaultLink`; e.g. the device-lock passcode
     is a `device-lock`-tagged Vault item linked to the asset.
   - Machine ingest keys are stored **hashed** (`SystemSetting`, SHA-256) for
     auth and additionally **KMS-encrypted** for reveal (Settings → Integrations).
2. **RBAC is additive, least-privilege, backend-enforced, never auto-admin.**
3. **The access-request / positions / default-permission feature is
   DOCUMENT-ONLY** — it produces request paperwork (form 4.A) and records
   sign-offs; it must **never** grant real system roles/permissions.
4. Never expose secrets in logs, PDFs, exports, or commits. Reveal/copy is
   audited (and MFA-gated for HIGH/CRITICAL).
5. Bulk SQL/imports bypass audit/validation — do them off-hours with a backup;
   secret-bearing import files must go through the encrypting UI import and be
   deleted after.

## 7. Data model & migration conventions

- Prisma **enums are top-level `@prisma/client` exports** (e.g.
  `import type { BorrowRequestStatus, PurchaseStatus }`), **not** `Prisma.X`.
- Multi-tenant: filter every query by `organizationId` and `deletedAt: null`.
- Every schema change ships a migration under `prisma/migrations/`. Prod applies
  them via the `itbox-migrate` Cloud Run job on deploy; write additive,
  idempotent SQL (`ADD COLUMN IF NOT EXISTS`, `ON CONFLICT DO NOTHING`) for
  backfills so existing orgs are safe.
- Run `npx prisma generate` after editing `schema.prisma` (stale client = false
  tsc errors about `omit`/new fields).

## 8. Deployment

- `.github/workflows/deploy.yml` deploys on push to `main` **and** the working
  branch `claude/enterprise-it-management-system-pz0u9s`.
- Steps: Cloud Build image → **Apply database migrations** (`itbox-migrate`
  job = `prisma migrate deploy`) → deploy Cloud Run (image only) → show URL.
- After pushing a schema change, confirm the migrate step succeeded (it is the
  step that can fail on a bad migration). Live URL:
  `https://itbox-ppjbzqdu3q-as.a.run.app`.
- PDF routes must be listed in `outputFileTracingIncludes` in `next.config.ts`
  so the Thai/serif TTFs ship with the standalone bundle; pdfkit is created with
  `new PDFDocument({ font: "" })` and a registered Thai font.

## 9. Integrations (verified)

| System | Direction | Endpoint / mechanism | Auth |
| --- | --- | --- | --- |
| **HR-ATS** (HR Intelligence & ATS, repo `chaithanin/HR-ATS`) | push → ITBox | `POST /api/hr/employees/sync` (roster upsert by `employeeCode`; joiner/mover/leaver → onboarding/offboarding + notifications). HR-ATS pushes on create/update/deactivate + a daily `techcore-roster-sync` | `Authorization: Bearer <hr.ingest key>` (hashed in `SystemSetting`) |
| **Synology / IT-report collector** | push → ITBox | `POST /api/it-report/ingest` | collector key (`itreport.ingest`) |
| **CCTV collector** (Python agent) | push → ITBox | `POST /api/cctv/ingest` (+ snapshots) | collector key |
| **LINE** | ITBox → out | notifications where configured | env token, no-op if unset |
| **Reports export** | in-app | `GET /api/reports/[report]?format=csv\|xlsx\|pdf` (single generic builder; permission-guarded per report) | session |

Ingest auth is resolved by `resolveIngestOrg(req, { keys })` in
`src/lib/ingest-auth.ts` (per-IP + per-org rate limits). Manage keys at
**Settings → Integrations** (generate / reveal / revoke / test).

## 10. Conventions & gotchas

- **Server components** query Prisma directly; **mutations** are Server Actions
  in a module's `actions.ts` (`"use server"`), then `revalidatePath` + `redirect`.
- **Live search:** client `SearchFilterBar` (debounced `router.replace` +
  `useTransition`); keep `parsePage`/`Pagination` server-safe in `list-controls.tsx`.
- **Charts are server-rendered** primitives in `src/components/charts.tsx`
  (Donut/HBars/Meter/Sparkline) — no chart library.
- **Reports** follow Dashboard → Summary → Chart → Alert → Detail; the export
  route is the one place to add a new downloadable report.
- **PDF/print** for the access-request form: the "Print" and "Export" buttons
  both hit the server PDF endpoint (selected-only), so print output === PDF.
- Match surrounding code style; keep comment density and bilingual (TH/EN) UI
  copy consistent with the module you touch.

## 11. Related repositories

- `chaithanin/HR-ATS` — HR Intelligence & ATS; source of truth for people data;
  pushes the roster into ITBox (see §9).
- `chaithanin/booking` — condo/unit sales & booking system (separate GCP project
  `ctn-booking`); not integrated with ITBox today.
