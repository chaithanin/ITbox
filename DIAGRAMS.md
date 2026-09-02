# Diagrams — full ERD & state machines

Rendered by GitHub's Mermaid support. Every table also carries `organizationId`
(the tenant key) and most carry `deletedAt` — these are omitted from the ER
diagrams for readability. See `DATABASE.md` for modeling decisions.

## Module map

```mermaid
flowchart TD
  ORG["Organization (tenant root)"] --> RBAC["RBAC: User · Role · Permission"]
  ORG --> PEOPLE["People: Employee · Department · Location"]
  ORG --> ASSET["Assets & Borrowing"]
  ORG --> VAULT["Vault"]
  ORG --> ITSM["IT Support (ITSM)"]
  ORG --> BIZ["Procurement · Licensing · Vendors · Maintenance · Contracts"]
  ORG --> CCTV["CCTV Monitoring"]
  ORG --> ITIL["ITIL/Infra: Change · Problem · KB · Vuln · CMDB · Network · Backup · Catalog · Monitoring"]
  ORG --> PLAT["Platform: Notification · AuditLog · SystemSetting"]
  PEOPLE -. "requester/holder" .-> ASSET
  PEOPLE -. "requester" .-> ITSM
  ASSET -. "credential link" .-> VAULT
```

---

## ERD — Tenancy & RBAC

```mermaid
erDiagram
  Organization ||--o{ User : ""
  Organization ||--o{ Role : "per-org"
  User ||--o{ UserRole : ""
  Role ||--o{ UserRole : ""
  Role ||--o{ RolePermission : ""
  Permission ||--o{ RolePermission : "global catalog"
  User ||--o{ UserSession : "revocable"
  User ||--o{ WebAuthnCredential : "passkeys"
  User ||--o{ OAuthAccount : "SSO"
```

## ERD — People & HR

```mermaid
erDiagram
  Department ||--o{ Employee : ""
  Location ||--o{ Employee : ""
  Employee ||--o| User : "userId (login)"
  Employee ||--o{ Employee : "manager"
  Employee ||--o{ Onboarding : ""
  Employee ||--o{ Offboarding : ""
```

## ERD — Assets & custody

```mermaid
erDiagram
  AssetCategory ||--o{ Asset : ""
  Department ||--o{ Asset : ""
  Location ||--o{ Asset : ""
  Vendor ||--o{ Asset : ""
  Asset ||--o{ AssetAssignment : "custody ledger"
  Asset ||--o{ AssetTransfer : ""
  Asset ||--o{ AssetHistory : "event log"
  Asset ||--o{ AssetDocument : ""
  Employee ||--o{ AssetAssignment : "holds"
```

## ERD — Borrowing & return

```mermaid
erDiagram
  Employee ||--o{ BorrowRequest : "requests"
  Department ||--o{ BorrowRequest : ""
  BorrowRequest ||--o{ BorrowRequestItem : "contains"
  BorrowRequest ||--o{ BorrowApproval : "chain"
  BorrowRequest ||--o{ AssetIssueRecord : "issued"
  BorrowRequest ||--o{ AssetReturnRecord : "returned"
  BorrowRequest ||--o{ DigitalSignature : "signature-ready"
  BorrowRequestItem }o--|| Asset : "references"
  BorrowRequestItem ||--o{ AssetIssueItem : ""
  BorrowRequestItem ||--o{ AssetReturnItem : ""
  AssetIssueRecord ||--o{ AssetIssueItem : "lines"
  AssetReturnRecord ||--o{ AssetReturnItem : "lines"
  AssetIssueItem ||--o{ AssetConditionPhoto : "before"
  AssetReturnItem ||--o{ AssetConditionPhoto : "after"
```

## ERD — Vault

```mermaid
erDiagram
  VaultCategory ||--o{ VaultItem : ""
  VaultItem ||--o{ VaultShare : "user/role/dept, expiring"
  VaultItem ||--o{ VaultAccessLog : "reveal/copy audit"
  VaultItem ||--o{ VaultRotationLog : ""
  VaultItem ||--o{ VaultEmergencyRequest : "break-glass"
  VaultItem ||--o{ VaultFavorite : ""
  VaultItem ||--o{ AssetVaultLink : ""
  Asset ||--o{ AssetVaultLink : "credential link"
```

## ERD — IT Support (ITSM)

```mermaid
erDiagram
  CaseType ||--o{ SupportCase : ""
  CaseCategory ||--o{ SupportCase : ""
  CaseCategory ||--o{ CaseCategory : "tree"
  SlaPolicy ||--o{ SupportCase : "targets"
  SupportTeam ||--o{ SupportTeamMember : ""
  SupportTeam ||--o{ SupportCase : "assigned"
  Employee ||--o{ SupportCase : "requester"
  User ||--o{ SupportCase : "agent"
  SupportCase ||--o{ CaseComment : ""
  SupportCase ||--o{ CaseAttachment : ""
  SupportCase ||--o{ CaseEvent : "history"
  SupportCase ||--o| CaseSatisfaction : "CSAT"
  SupportTeam ||--o{ KpiConfig : ""
  User ||--o{ KpiMetric : "agent KPIs"
```

## ERD — Procurement · Licensing · Vendors · Maintenance · Contracts

```mermaid
erDiagram
  Vendor ||--o{ PurchaseRequest : ""
  Vendor ||--o{ License : ""
  Vendor ||--o{ Subscription : ""
  Vendor ||--o{ Contract : ""
  Vendor ||--o{ MaintenanceTicket : ""
  Department ||--o{ PurchaseRequest : ""
  PurchaseRequest ||--o{ PurchaseItem : "lines"
  PurchaseRequest ||--o{ Approval : "Manager→IT→Finance"
  License ||--o{ LicenseAssignment : "seats"
  Employee ||--o{ LicenseAssignment : ""
  Asset ||--o{ MaintenanceTicket : ""
```

## ERD — CCTV monitoring

```mermaid
erDiagram
  Location ||--o{ CctvRecorder : ""
  Asset ||--o| CctvRecorder : "asset link"
  CctvRecorder ||--o{ CctvCamera : ""
  CctvRecorder ||--o{ CctvHealthLog : ""
  CctvRecorder ||--o{ CctvStorageLog : ""
  CctvRecorder ||--o{ CctvIncident : ""
  CctvCamera ||--o{ CctvHealthLog : ""
  CctvCamera ||--o{ CctvIncident : ""
```

## ERD — ITIL / infrastructure

```mermaid
erDiagram
  Location ||--o{ NetworkDevice : ""
  Location ||--o{ Vlan : ""
  Location ||--o{ Subnet : ""
  Subnet ||--o{ IpAddress : ""
  Asset ||--o{ IpAddress : "assigned"
  Asset ||--o{ ConfigurationItem : ""
  Asset ||--o{ Vulnerability : ""
  Asset ||--o{ EndpointPosture : ""
  ConfigurationItem ||--o{ CiRelationship : "source"
  ConfigurationItem ||--o{ CiRelationship : "target"
```

Standalone per-org registries (no strong FK beyond the tenant + optional
asset/vendor links): `ChangeRequest`, `Problem`, `KbArticle`, `BackupJob`,
`ServiceCatalogItem`, `MonitoringHost`, `ItHealthCheck` (+ `ItHealthEvidence`).

---

## State machine — Asset lifecycle (`AssetStatus`)

Combines permanent assignment, temporary borrowing, repair, and end-of-life.

```mermaid
stateDiagram-v2
  [*] --> AVAILABLE : register
  AVAILABLE --> ASSIGNED : assign (permanent)
  ASSIGNED --> AVAILABLE : return
  ASSIGNED --> IN_USE : in use
  IN_USE --> AVAILABLE : return

  AVAILABLE --> RESERVED : borrow submit
  RESERVED --> AVAILABLE : reject / cancel (release)
  RESERVED --> BORROWED : issue / handover
  BORROWED --> AVAILABLE : return (good)
  BORROWED --> IN_REPAIR : return (damaged)
  BORROWED --> LOST : return (lost)

  AVAILABLE --> IN_REPAIR : maintenance
  ASSIGNED --> IN_REPAIR : maintenance
  IN_REPAIR --> AVAILABLE : repaired
  AVAILABLE --> DAMAGED : mark damaged
  AVAILABLE --> STOLEN : mark stolen

  AVAILABLE --> RETIRED : retire
  ASSIGNED --> RETIRED : retire
  IN_REPAIR --> RETIRED : retire
  RETIRED --> DISPOSED : dispose
  DISPOSED --> [*]
```

## State machine — Borrow request (`BorrowRequestStatus`)

Current workflow = **single IT approval**. "Due soon" / "Overdue" are **derived**
from `dueDate`, not stored. (The enum retains `PENDING_MANAGER` /
`PENDING_MANAGEMENT` / `APPROVED` for a configurable multi-step chain.)

```mermaid
stateDiagram-v2
  [*] --> DRAFT : create (save draft)
  [*] --> PENDING_IT : create + submit
  DRAFT --> PENDING_IT : submit
  DRAFT --> CANCELLED : cancel
  PENDING_IT --> READY_TO_ISSUE : IT approve (last step)
  PENDING_IT --> REJECTED : reject (release assets)
  PENDING_IT --> CANCELLED : cancel
  READY_TO_ISSUE --> ISSUED : issue / handover
  READY_TO_ISSUE --> CANCELLED : cancel
  ISSUED --> PARTIALLY_RETURNED : partial return
  PARTIALLY_RETURNED --> PARTIALLY_RETURNED : more returns
  ISSUED --> CLOSED : full return
  PARTIALLY_RETURNED --> CLOSED : final return
  REJECTED --> [*]
  CANCELLED --> [*]
  CLOSED --> [*]
```

## State machine — Borrow item (`BorrowItemStatus`)

Per-asset line status, enabling partial returns.

```mermaid
stateDiagram-v2
  [*] --> PENDING : on request (asset RESERVED)
  PENDING --> ISSUED : issued (asset BORROWED)
  ISSUED --> RETURNED : returned good (asset AVAILABLE)
  ISSUED --> DAMAGED : returned damaged (asset IN_REPAIR)
  ISSUED --> LOST : returned lost (asset LOST)
  RETURNED --> [*]
  DAMAGED --> [*]
  LOST --> [*]
```

## State machine — Support case (`CaseStatus`)

```mermaid
stateDiagram-v2
  [*] --> NEW : open
  NEW --> TRIAGE : triage
  TRIAGE --> IN_PROGRESS : assign + work
  IN_PROGRESS --> WAITING_USER : need info
  WAITING_USER --> IN_PROGRESS : reply
  IN_PROGRESS --> RESOLVED : resolve
  RESOLVED --> CLOSED : confirm / auto-close
  RESOLVED --> REOPENED : reopened
  REOPENED --> IN_PROGRESS : rework
  CLOSED --> [*]
```
