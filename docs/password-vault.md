# Password Vault — Design & Security

## Storage model

Vault secrets are stored **only** as ciphertext (`vault_items.ciphertext`,
`iv`, `authTag`) with a per-record Data Encryption Key that is itself stored
wrapped (`dekEnc`). Plaintext never touches the database, logs, cache, or
analytics.

### Envelope encryption

```
secret JSON ── AES-256-GCM (fresh 256-bit DEK, 96-bit IV) ──> ciphertext+tag
DEK ── Cloud KMS encrypt (production) ──> dekEnc
store { ciphertext, iv, authTag, dekEnc, kmsKeyVersion }
DEK buffer zeroed after use
```

Decryption reverses the chain; the DEK is unwrapped by KMS per request and
zeroed after use. `KMS_PROVIDER=local` (dev only) wraps DEKs with a key derived
from `LOCAL_KMS_MASTER_KEY`; it refuses to run with `NODE_ENV=production`.

### Why encrypt (not hash)?

- **User login passwords** must never be recoverable → **Argon2id hash**.
- **Vault secrets** must be recoverable to be useful → **AES-256-GCM +
  KMS envelope encryption**. Hashing would make them unusable.
- No user "master password" is stored anywhere; vault key custody is in
  Cloud KMS, not in user secrets or the database.

## Reveal chain (Section 14 of the spec)

`POST /api/vault/:id/reveal` executes, in order:

1. Authentication (revocable session)
2. RBAC permission (`vault:reveal` / `vault:copy`)
3. Per-item access level (owner / vault:manage / active share ≥ REVEAL)
4. MFA policy — HIGH/CRITICAL or `requireMfaToReveal` ⇒ verified TOTP code
   required; account without MFA enrollment is refused
5. Approval policy — `requireApprovalToReveal` ⇒ approved, unexpired
   emergency request required
6. Decrypt (KMS unwrap → AES-GCM)
7. `vault_access_logs` + `audit_logs` entry (REVEAL_SECRET / COPY_SECRET,
   with IP + user agent; never the value)
8. Response with `Cache-Control: no-store`; UI auto-hides after 30 s and
   clears component state; clipboard cleared after 30 s (best effort)

Every denial is also logged with a reason (`NO_RBAC_PERMISSION`,
`NO_ITEM_ACCESS`, `MFA_INVALID`, `APPROVAL_REQUIRED`, ...).

## Sharing & temporary access

Shares target a user, role, or department with a permission level
(VIEW < REVEAL < COPY < EDIT < SHARE), an optional start time and an expiry
(1h/1d/7d/30d/custom/never). Expired or revoked shares are excluded from every
access decision at query time (auto-revoke); a daily job also stamps
`revokedAt` for hygiene. Offboarding revokes all of a user's shares.

## Emergency access (break glass)

Requester files a reason → IT_MANAGER / SECURITY_ADMIN approves with a
validity window (self-approval blocked) → requester may pass the approval
gate until expiry. All steps audited + notified.

## Classification policy

| Level    | Effect                                             |
|----------|----------------------------------------------------|
| LOW      | normal access rules                                |
| MEDIUM   | normal access rules                                |
| HIGH     | MFA required to reveal + confirmation dialog       |
| CRITICAL | MFA required + confirmation dialog (+ optional approval) |

## What is never done

- No plaintext secrets in DB, logs, audit detail, error messages, exports.
- No plaintext search over secret values (metadata search only).
- No third-party breach checking with plaintext; security posture is computed
  from metadata (rotation age, classification, share breadth, access logs).
- Vault export endpoints do not exist; reports contain metadata only.
