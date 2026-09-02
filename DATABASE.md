# Database

- **Engine:** PostgreSQL 16 (Cloud SQL in production).
- **ORM:** Prisma 6 (`prisma/schema.prisma`), **86 models**, migration history in
  `prisma/migrations/` (**24 migrations**, applied via `prisma migrate deploy`).
- **IDs:** UUID primary keys (`@db.Uuid`).
- **Tenancy:** almost every table has `organizationId` and is filtered by it.
- **Soft delete:** most domain tables carry `deletedAt` (queries filter `deletedAt: null`).
- **Timestamps:** `createdAt` / `updatedAt`; several tables also track
  `createdById` / `updatedById`.

## 1. Domain groups

| Area | Key models |
|---|---|
| **Tenancy & auth** | `Organization`, `User`, `UserSession`, `WebAuthnCredential`, `OAuthAccount` |
| **RBAC** | `Permission`, `Role`, `RolePermission`, `UserRole` |
| **People** | `Employee`, `Department`, `Location`, `Onboarding`, `Offboarding` |
| **Assets** | `Asset`, `AssetCategory`, `AssetAssignment`, `AssetTransfer`, `AssetHistory`, `AssetDocument` |
| **Borrowing** | `BorrowRequest`, `BorrowRequestItem`, `BorrowApproval`, `AssetIssueRecord`/`Item`, `AssetReturnRecord`/`Item`, `AssetConditionPhoto`, `DigitalSignature` |
| **Vault** | `VaultItem`, `VaultCategory`, `VaultShare`, `VaultFavorite`, `VaultAccessLog`, `VaultRotationLog`, `VaultEmergencyRequest`, `EncryptionKeyMetadata` |
| **ITSM (support)** | `SupportCase`, `CaseType`, `CaseCategory`, `SlaPolicy`, `SupportTeam`, `CaseComment`, `CaseEvent`, `CaseSatisfaction`, `KpiMetric`, `KpiConfig`, `SignatureTemplate` |
| **Procurement** | `PurchaseRequest`, `PurchaseItem`, `Approval`, `Vendor` |
| **Licensing** | `License`, `LicenseAssignment`, `Subscription`, `Contract` |
| **Maintenance** | `MaintenanceTicket` |
| **CCTV** | `CctvRecorder`, `CctvCamera`, `CctvHealthLog`, `CctvStorageLog`, `CctvIncident` |
| **ITIL / infra** | `NetworkDevice`, `Vlan`, `Subnet`, `IpAddress`, `ChangeRequest`, `Problem`, `KbArticle`, `Vulnerability`, `ConfigurationItem`, `CiRelationship`, `BackupJob`, `ServiceCatalogItem`, `EndpointPosture`, `MonitoringHost`, `ItHealthCheck` |
| **Platform** | `Notification`, `AuditLog`, `SystemSetting` |

## 2. Key modeling decisions

- **Permissions in the DB.** RBAC is data, not code. A permission a user holds is
  `UserRole → Role → RolePermission → Permission.key`. Adding a key in code has no
  effect on existing orgs until a migration/seed grants it.

- **Asset custody is a ledger.** `AssetAssignment` is an append-only record of
  checkouts/returns; the current holder is denormalized onto `Asset.assignedToId`
  and `Asset.status` for fast reads. `AssetHistory` is an immutable, human-readable
  event log (`REGISTER`, `ASSIGN`, `RETURN`, `TRANSFER`, `BORROW_ISSUE`, …).

- **Borrowing is distinct from assignment.** Permanent custody uses
  `AssetAssignment`; **temporary loans** use the `BorrowRequest` family. Asset
  status flows `AVAILABLE → RESERVED → BORROWED → (AVAILABLE | IN_REPAIR | LOST)`.
  `AssetStatus` gained `RESERVED` and `BORROWED` for this.
  - **Approval chain** is data-lite: `APPROVAL_CHAIN` (currently a single `IT`
    step) creates `BorrowApproval` rows on submit; each approval advances the
    request; the last one moves it to `READY_TO_ISSUE`.
  - **"Due soon" / "Overdue"** are **derived from `dueDate`**, never stored — the
    stored status stays authoritative (see `src/lib/borrow/status.ts`).
  - **Digital-signature-ready:** `DigitalSignature` carries `signatureType`,
    `signatureImage`, `signedByUserId`, `signedAt`, `ipAddress` for a future
    e-signature step; the A4 PDF is rendered from these DB rows.

- **Vault stores ciphertext only.** Secret values are AES-256-GCM encrypted with a
  per-item data key wrapped by KMS (envelope encryption). Reveal/copy are audited
  in `VaultAccessLog`; plaintext never appears in reports or logs.

- **Reference numbers** are generated with a count-plus-retry against a unique
  index: support cases `IT-<prefix>-YYYY-000000`, borrow requests
  `IT-BR-YYYY-0001` (`refYear`/`refSeq` columns back the human `refNo`).

- **Immutable audit.** `AuditLog` rows are write-only (actor, action, entity,
  before/after diff, ip, result). Application code never updates or deletes them.

## 3. KPI & SLA formulas (support module)

Computed by the SLA/KPI engine in `src/lib/services/support.ts`:

- **First-response due** = `caseCreatedAt + SlaPolicy.firstResponseMins`, counting
  only business hours when `businessHoursOnly` is set (`SupportTeam` hours minus
  `Holiday` days). Same for **resolution due** using `resolveMins`.
- **SLA breach** = the case passed its `firstResponseDueAt` / `resolveDueAt`
  without the corresponding timestamp (`firstRespondedAt` / `resolvedAt`). The
  5-minute sweep raises WARNING before the due time and CRITICAL/escalation after.
- **First-response time** = `firstRespondedAt − createdAt`.
- **Resolution time / MTTR** = `resolvedAt − createdAt` (business-hours adjusted).
- **CSAT** = average of `CaseSatisfaction.rating` (1–5) over the period.
- **Agent KPIs** (`KpiMetric` / `KpiConfig`) roll up cases handled, on-time
  first-response %, on-time resolution %, and CSAT per agent/team.

## 4. Migrations

Run in order by `prisma migrate deploy`. Notable entries:

- `20260812142927_init` — base schema.
- `20260813104051_itsm_support_cases` — ITSM.
- `20260828160000_enterprise_modules` / `_itil_security_modules` / `_cmdb_and_urgency`
  / `_onboarding_catalog_edr_monitoring` — the ITIL/infra suite.
- `20260828210000_cctv_monitoring`, `_cctv_phase3` — CCTV.
- `20260902120000_borrow_return_module` — borrow tables + enums (`AssetStatus`
  gains `RESERVED`/`BORROWED`; enum `ADD VALUE` is safe in-transaction on PG 12+).
- `20260902130000_borrow_permissions_grant` — backfills `borrow:*` grants for
  existing orgs' roles.

**Local:** `npm run db:migrate` (dev) / `npm run db:deploy` (apply). `npm run db:seed`
seeds demo org, roles, permissions, and sample data (passwords from
`SEED_ADMIN_PASSWORD` / `SEED_USER_PASSWORD`).
