# Database Design

PostgreSQL + Prisma (`prisma/schema.prisma` is the source of truth).
UUID keys, `createdAt`/`updatedAt` everywhere, soft delete (`deletedAt`) on
business entities, FKs + composite unique constraints per organization,
indexes on hot query paths.

## Entity groups

| Group | Tables |
|---|---|
| Tenancy | organizations |
| Identity/RBAC | users, oauth_accounts, user_sessions, roles, permissions, role_permissions, user_roles |
| Org structure | employees, departments, locations |
| Assets | assets, asset_categories, asset_assignments, asset_transfers, asset_history, asset_documents, asset_maintenance |
| Vault | vault_items (encrypted), vault_categories, vault_shares, vault_favorites, vault_access_logs, vault_rotation_logs, vault_emergency_requests, asset_vault_links, encryption_key_metadata |
| Licensing | licenses, license_assignments, subscriptions |
| Procurement | vendors, purchase_requests, purchase_items, approvals |
| Ops | offboardings, notifications, audit_logs, system_settings |

## ERD (core relationships)

```
organizations 1─* users 1─* user_roles *─1 roles 1─* role_permissions *─1 permissions
organizations 1─* employees *─1 departments / locations;  employees 1─? users
organizations 1─* assets *─1 asset_categories/vendors
assets 1─* asset_assignments *─1 employees
assets 1─* asset_history / asset_transfers / asset_maintenance / asset_documents
assets *─* vault_items  (asset_vault_links, labeled)      ← Asset ↔ Credential link
organizations 1─* vault_items *─1 vault_categories; vault_items *─1 users (owner)
vault_items 1─* vault_shares (→ user | role | department, expiring)
vault_items 1─* vault_access_logs / vault_rotation_logs / vault_emergency_requests
licenses 1─* license_assignments *─1 employees
purchase_requests 1─* purchase_items; purchase_requests 1─* approvals
employees 1─* offboardings
```

## Encrypted columns

`vault_items`: `ciphertext`, `iv`, `authTag`, `dekEnc`, `kmsKeyVersion`,
`encryption_algorithm='AES-256-GCM'` — see docs/password-vault.md.
`users.totpSecretEnc/totpSecretDekEnc` — TOTP secret (same envelope).
`licenses.licenseKey*` — reserved encrypted columns (UI intentionally leaves
them null; storing license keys belongs in the vault with an asset link).

Searchable metadata (name, username, host, tags, classification) is plaintext
by design; secret values are never queried.

## Migrations

- Local: `npm run db:migrate` (creates + applies in `prisma/migrations/`)
- Production: `npm run db:deploy` (applies committed migrations; run in the
  Cloud Build `migrate` step before deploy)
- Seed: `npm run db:seed` (idempotent; demo data only, passwords from env)
