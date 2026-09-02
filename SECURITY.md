# Security

## 1. Authentication

- **NextAuth v5 (Auth.js)** with JWT session cookies. Edge middleware
  (`src/middleware.ts`) does a cookie check only; the authoritative validation is
  server-side in `getCurrentUser()`:
  - session revocation via `UserSession.tokenId` (`jti`),
  - user `status` (ACTIVE/DISABLED/LOCKED),
  - org, roles, and flattened permissions.
- **Providers:** Credentials, Google OAuth, Microsoft Entra ID (opt-in).
- **Password hashing:** **Argon2id** (`@node-rs/argon2`). Recent hashes are kept
  in `User.passwordHistory` to block reuse on change/reset.
- **MFA:** TOTP (`otpauth`) and **WebAuthn/passkeys** (`@simplewebauthn`).
  Sensitive actions (e.g. vault reveal) can require a step-up.
- **Sessions:** JWT cookie backed by a **revocable DB record** (`UserSession`),
  an 8-hour absolute timeout, and "log out everywhere" (revoke all sessions).

## 2. Authorization (RBAC)

- Permissions are a **DB catalog** (`Permission` → `RolePermission` → `Role` →
  `UserRole` → `User`), flattened per request into `user.permissions`.
- Every page/action gates with `requirePermission("x:y")` or
  `user.permissions.has(...)`. Missing permission → `AuthError` (403) on actions,
  an access-denied panel or `notFound()` on pages.
- **Separation of duties:** an approver cannot approve their own request (borrow
  and procurement both enforce this); step→role maps decide who may act on each
  approval step.
- **Multi-tenancy:** every query filters by `organizationId`; a cross-org id
  returns 404. Isolation is enforced in the application layer.

## 3. Secrets & data protection

- **Vault (envelope encryption):** secret values are encrypted with AES-256-GCM
  using a per-item data-encryption key that is itself wrapped by **Google Cloud
  KMS** (`src/lib/kms.ts`, `src/lib/envelope.ts`); a local key is used only in
  dev. Ciphertext is all that is stored. Reveal/copy are logged in
  `VaultAccessLog`; secret plaintext never appears in reports, exports, or logs.
- **Reveal chain:** authn → RBAC (`vault:reveal`) → per-item ACL → step-up MFA
  for HIGH/CRITICAL items → break-glass approval where required → decrypt → audit
  (the value is **never** logged) → the plaintext auto-hides in the UI after ~30s.
- **Rotation & emergency access:** `VaultRotationLog` tracks rotation;
  `VaultEmergencyRequest` gates break-glass access (`vault:emergency`, held by
  SUPER_ADMIN / SECURITY_ADMIN only).
- **Environment secrets:** in production all secrets come from **Google Secret
  Manager**, injected into Cloud Run. `.env` is never committed.

## 4. Ingest & machine auth

- Collector endpoints authenticate by **API key** (`x-api-key` / bearer), matched
  by **SHA-256 hash** against a per-org `SystemSetting` — the raw key is never
  stored. Distinct pipelines use distinct keys (e.g. `hr.ingest` is separate from
  the shared `itreport.ingest`).
- `clientIp(req)` trusts only the right-most `INGEST_TRUSTED_PROXIES` hops of
  `X-Forwarded-For` to prevent IP spoofing.
- Ingest routes are the only session-exempt paths (allowlist in
  `src/auth.config.ts`).

## 5. Scheduled jobs

- `/api/cron/*` require `Authorization: Bearer $CRON_SECRET`, compared in
  **constant time** (`crypto.timingSafeEqual`, `src/lib/cron-auth.ts`) to avoid a
  timing side-channel.

## 6. Audit & integrity

- **Immutable audit log** (`AuditLog`): actor, action, entity, before/after diff,
  IP, user-agent, result. Written by `auditLog(...)`; never updated or deleted.
- Sensitive entities keep their own history (e.g. `AssetHistory`,
  `VaultAccessLog`, `CaseEvent`).
- Completed transactions are not silently edited; changes are new records.

## 7. Application hardening

- **Input validation** with Zod on every action/route boundary.
- **Concurrency safety:** `$transaction` + `SELECT … FOR UPDATE` on asset/borrow
  state changes prevents double-issue / double-approve.
- **CSV injection** neutralized on export; **XLSX** written as plain values.
- **Security headers** including a `Content-Security-Policy` (report-only baseline
  in `next.config.ts`).
- **Server Action inputs** carry decisions in hidden inputs, not submit-button
  `name`/`value` (which are not delivered to Server Actions in this Next/React
  version).

## 8. PDPA / personal data

- Personal data (employees, requesters) is org-scoped and permission-gated.
- The public QR scan page (`/scan/[id]`) shows only non-identifying asset fields
  to anonymous users; holder/department/location require a signed-in same-org user.
- The public employee-lookup endpoint returns only a match confirmation, no PII.
- See `pdpa.md` for the data-subject handling notes.

## 9. Known gaps / hardening backlog

- **No row-level DB security** — tenancy is app-enforced; a raw DB compromise
  bypasses it. (Mitigated by least-privilege DB creds and Cloud SQL isolation.)
- **CSP is baseline / partly report-only** — tighten to strict per-route policies.
- **Server-action version skew** — after a redeploy, an already-open browser tab
  references old action IDs and a click throws until the tab is reloaded; a
  borrow-segment error boundary + reload button mitigates the UX, but there is no
  cross-build action-id stability.
- **Rate limiting** on auth/ingest is not yet centralized.
- **Secret rotation** for ingest/cron keys is manual (via Settings / Secret Manager).
- Rotate any credential that has ever been shared in plaintext (e.g. early CCTV
  collector keys) and prefer per-pipeline keys.

Report suspected vulnerabilities to the IT security owner; do not file secrets in
issues or PRs.
