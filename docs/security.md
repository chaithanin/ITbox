# Security Architecture

## Principles
Least privilege · Zero trust (every request re-checked) · Defense in depth ·
Secure by default · Fail secure · Audit everything.

## Authentication
- Credentials: **Argon2id** (19 MiB, t=2) via `@node-rs/argon2`; uniform error
  for unknown user / wrong password; lockout after 5 failures (15 min);
  per-email rate limiting.
- Google OAuth (Workspace / Cloud Identity): only pre-provisioned ACTIVE users
  may sign in; unverified emails rejected. Microsoft Entra ID can be added as
  another Auth.js provider without schema changes.
- MFA: TOTP (RFC 6238). The TOTP secret is stored envelope-encrypted. QR is
  served only during pending enrollment. MFA is enforced for HIGH/CRITICAL
  secret reveals.

## Sessions
- JWT cookie (HttpOnly, Secure in production, SameSite=Lax) + server-side
  `user_sessions` row keyed by `jti` → revocable.
- Absolute timeout 8 h; sessions view + revoke one/all in Profile settings;
  admin disable/reset revokes all sessions.

## Authorization (RBAC)
- Global permission catalog (`<resource>:<action>`), per-org roles, editable
  permission matrix (SUPER_ADMIN locked). Checks happen server-side in every
  page, server action, and API route via `requirePermission`.
- Vault adds per-item ACLs (owner / shares with levels) on top of RBAC.

## Input/output protection
- zod validation on every mutation; Prisma parameterized queries (no SQL
  injection); React escaping (XSS); no `dangerouslySetInnerHTML` with user
  data; CSV export cells sanitized against formula injection.
- CSRF: Auth.js token for auth routes; server actions are same-origin enforced
  by Next.js; cookies SameSite=Lax.
- Security headers (next.config.ts): HSTS, X-Frame-Options DENY, nosniff,
  referrer policy, permissions policy.

## Rate limiting
App-layer sliding window (login, reveal endpoints). For production put Cloud
Armor / API Gateway quotas in front as the primary layer.

## Audit
Append-only `audit_logs` (+ `vault_access_logs`) with user, action, entity,
result, IP, user agent. A sanitizer strips password/secret/token/key fields
from audit detail payloads defensively. No API mutation path exists to modify
or delete audit rows (immutable to normal users).

## Secrets handling
- `.env` files are gitignored; production secrets live in Google Secret
  Manager; KMS keys never leave Cloud KMS.
- CI runs gitleaks secret scanning + npm dependency audit.
- Prisma logs errors only; decrypted values are never logged (verified by
  integration test asserting no plaintext in DB rows or access logs).

## PDPA (see pdpa.md)
Employee personal data is role-gated (`employee:read`), access is audited
(VIEW EMPLOYEE), and exports require explicit permissions.
