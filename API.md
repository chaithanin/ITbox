# API Reference

ITBox mutates primarily through **Server Actions** (not REST). The REST surface
under `/api/*` is for authentication, machine-to-machine ingest, file exports,
QR/PDF generation, and scheduled jobs.

## Authentication modes

| Mode | How | Used by |
|---|---|---|
| **Session** | NextAuth cookie (browser). `requirePermission()` enforces RBAC. | UI-facing routes (exports, vault reveal, PDFs). |
| **API key** | `x-api-key: <key>` or `Authorization: Bearer <key>`; matched by SHA-256 against a per-org `SystemSetting`. | Ingest pipelines. |
| **Cron secret** | `Authorization: Bearer $CRON_SECRET` (constant-time). | `/api/cron/*`. |
| **Public** | none (returns only non-identifying data). | `/api/public/employee-lookup`. |

Unless noted, session routes require a permission and are org-scoped. All routes
are `POST` unless a `GET` is implied by an export/read.

## Auth & account
| Route | Method | Notes |
|---|---|---|
| `/api/auth/[...nextauth]` | GET/POST | NextAuth (sign-in, callback, session, CSRF). |
| `/api/me/mfa/qr` | GET | TOTP enrolment QR. |
| `/api/me/webauthn/register-options` · `/register-verify` · `/auth-options` | POST | Passkey registration & assertion. |
| `/api/me/kpi-summary` | GET | Current agent's KPI popup data. |

## Assets
| Route | Method | Permission |
|---|---|---|
| `/api/assets` · `/api/assets/[id]` | GET | `asset:read` |
| `/api/assets/[id]/qr` | GET | `asset:read` — PNG QR → `/scan/{id}`. |
| `/api/assets/export` | GET | `asset:export` |
| `/api/assets/import` | POST | `asset:create` — CSV/XLSX bulk import with row errors. |

## Borrowing
| Route | Method | Permission |
|---|---|---|
| `/api/borrow/[id]/pdf` | GET | `borrow:read` — A4 company form (add `?download=1` to attach). |

Borrow create/submit/approve/issue/return are **Server Actions**
(`src/app/(app)/borrow/actions.ts`), not REST.

## People
| Route | Method | Notes |
|---|---|---|
| `/api/employees` · `/api/employees/[id]` · `/api/employees/[id]/assets` | GET | `employee:read` |
| `/api/employees/directory` | GET | Org directory. |
| `/api/employees/import` | POST | `employee:create` |
| `/api/hr/employees/sync` | POST | **API key** (`hr.ingest`) — HR push sync (upsert by employeeCode; carries name/nickname/phone/dept/position/start-date). |
| `/api/hr/employees/link-users` | POST | **API key** — reconcile employee↔user links. |
| `/api/hr/employees/match-report` | GET | Link coverage report. |
| `/api/public/employee-lookup` | POST | **Public** — staff-ID confirm step (no PII beyond match). |
| `/api/departments` · `/api/locations` | GET | read perms |

## Vault
| Route | Method | Permission |
|---|---|---|
| `/api/vault` · `/api/vault/[id]` | GET | `vault:read` |
| `/api/vault/[id]/reveal` | POST | `vault:reveal` — decrypts, audits, may require MFA. |
| `/api/vault/import` | POST | `vault:manage` — KMS-encrypted bulk import (optional `assetTag` column auto-links each secret to its asset). |

## Support (ITSM)
| Route | Method | Notes |
|---|---|---|
| `/api/support` | GET | `support:*` |
| `/api/support/attachments/[id]` | GET | Case attachment stream. |

## Reports & exports
| Route | Method | Permission |
|---|---|---|
| `/api/reports/[report]?format=csv\|xlsx\|pdf` | GET | `report:export` |
| `/api/it-report/export` · `/api/assets/export` · `/api/cctv/reports/[report]` | GET | module read/export perms |

Report keys include: `assets`, `assets-by-department`, `assignments`,
`maintenance`, `warranty`, `licenses`, `subscriptions`, `purchases`, `audit`,
`vault-access`, `borrow-requests`, `borrow-overdue`, `borrow-utilization`,
`access-review`, `access-requests`.
`audit` / `vault-access` also require `audit:read`; `access-review` /
`access-requests` require `accessreq:read`.

## Documents & access requests
| Route | Method | Notes |
|---|---|---|
| `/api/doc-forms/lookup?code=` | GET | Staff-ID → name/dept/position/phone/nickname/start-work for form auto-fill (session). |
| `/api/doc-forms/access-matrix-pdf` | POST | Selected-only 4.A PDF from the ERP matrix form (session). |
| `/api/access-requests/[id]/pdf` | GET | Saved access request as the 4.A document with captured approval sign-offs filled (`accessreq:read`). |

Access-request submit / approval sign-offs / provisioning are **Server Actions**
(`src/app/(app)/access-requests/actions.ts`, `documents/access-actions.ts`).

## Ingest (API-key authenticated)
| Route | Pipeline |
|---|---|
| `/api/it-report/ingest` | IT health-check collector (shared `itreport.ingest` key). |
| `/api/hr/employees/sync` | HR/ATS employee roster push (`hr.ingest`). |
| `/api/cctv/ingest` · `/api/cctv/snapshot` · `/api/cctv/snapshot/[cameraId]` · `/api/cctv/commands` | CCTV collector agent (health, snapshots, command poll). |
| `/api/edr/ingest` | Endpoint posture agent. |
| `/api/monitoring/ingest` | Host monitoring agent. |
| `/api/inventory/ingest` | Asset/license inventory push. |
| `/api/kb/import` | Knowledge-base bulk import. |

## Cron (CRON_SECRET)
| Route | Cadence | Purpose |
|---|---|---|
| `/api/cron/checks` | daily | Expiry/rotation alerts, borrow due/overdue, SLA sweep, email digest. |
| `/api/cron/sla` | 5–15 min | SLA warnings/breaches/escalation. |
| `/api/cron/cctv-daily` | daily | CCTV health report email. |

## Misc
| Route | Notes |
|---|---|
| `/api/documents/[id]` | Signed/streamed document download. |
| `/api/it-report/checks/[id]/evidence` · `/api/it-report/evidence/[id]` | IT health-check evidence. |

## Conventions
- Errors: JSON `{ "error": "code" }` with an appropriate HTTP status
  (`400 invalid`, `401 unauthorized`, `403 forbidden`, `404 not_found`, `501` for
  a missing dependency such as the Thai PDF font).
- Exports set `Content-Disposition` and `Cache-Control: no-store`.
- CSV exports prepend a UTF-8 BOM and neutralize spreadsheet formula injection.
