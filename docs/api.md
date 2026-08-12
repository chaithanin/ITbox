# REST API

All endpoints require an authenticated session (cookie). Responses are JSON.
Errors: `401 unauthenticated`, `403 forbidden`, `400 validation_error`,
`404`, `500 internal_error` (no internals leaked). Mutations are audited.
List endpoints paginate: `?page=1&pageSize=20` → `{ data, page, total }`.

| Endpoint | Methods | Permission |
|---|---|---|
| `/api/assets` | GET, POST | asset:read / asset:create |
| `/api/assets/:id` | GET, PUT, DELETE | asset:read / update / delete |
| `/api/assets/:id/qr` | GET (PNG) | authenticated |
| `/api/assets/export` | GET (CSV) | asset:export |
| `/api/assets/import` | GET (CSV template), POST (multipart CSV → row-validated bulk create) | asset:create |
| `/api/documents/:id` | GET (file download, org-scoped) | asset:read |
| `/api/employees`, `/api/employees/:id` | GET, POST / GET, PUT, DELETE | employee:* |
| `/api/departments`, `/api/locations` | GET, POST | department/location:* |
| `/api/licenses` | GET, POST | license:read / manage |
| `/api/subscriptions` | GET, POST | subscription:read / manage |
| `/api/vendors` | GET, POST | vendor:read / manage |
| `/api/maintenance` | GET, POST | maintenance:read / manage |
| `/api/procurement` | GET, POST | procurement:read / create |
| `/api/vault` | GET (metadata only), POST | vault:read / vault:create |
| `/api/vault/:id` | GET (metadata), DELETE | vault:read / vault:delete |
| `/api/vault/:id/reveal` | POST `{mfaCode?, reason?, action}` | vault:reveal / vault:copy + item access + MFA policy |
| `/api/reports/:report` | GET (CSV) | report:export (+ audit:read for audit/vault-access) |
| `/api/me/mfa/qr` | GET (PNG, enrollment only) | authenticated |
| `/api/cron/checks` | POST | `Authorization: Bearer $CRON_SECRET` |

Vault API notes:
- GET endpoints never return ciphertext or secret values — metadata only.
- `/reveal` executes the full access chain (RBAC → item ACL → MFA →
  approval), rate-limited, `Cache-Control: no-store`, fully audited.
