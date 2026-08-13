# IT Support / ITSM Case Management

A help-desk / ticketing module layered on the existing platform. It reuses
Asset / Employee / Department / Location / User / Notification / AuditLog /
Storage — no duplicate entities. Cases link directly to Assets, so opening a
"notebook broken" case knows the asset tag, warranty and history immediately.

## Roles & permissions
| Permission | Grants |
|---|---|
| `support:create` | open a case (everyone by default), see own cases |
| `support:read` | view the IT queue + metrics + all cases |
| `support:work` | triage, self-assign, work log, change status, resolve |
| `support:manage` | assign to others, override priority, reopen closed, manage queue |
| `support:settings` | admin: types, categories, SLA, teams, business hours, notifications |

Default role map: EMPLOYEE/HR/FINANCE/MANAGER → create (+ MANAGER read);
IT_STAFF/SECURITY_ADMIN → create/read/work; IT_MANAGER/ADMIN/SUPER_ADMIN → all.

## Case lifecycle (workflow)
```
NEW → TRIAGE → ASSIGNED → IN_PROGRESS → (WAITING_USER | WAITING_VENDOR) → RESOLVED → CLOSED
                                   ↘ REOPENED ↗            CANCELLED / DUPLICATE
```
Transitions are guarded (`canTransition`). Rules enforced by the engine:
- A **user reply** on `WAITING_USER` auto-resumes to `IN_PROGRESS`.
- **P1 cannot be RESOLVED/CLOSED** without a resolution note.
- Only `support:manage` may reopen a `CLOSED` case.
- The first agent public reply satisfies the First-Response SLA.

## Priority engine
User picks **impact**, not priority (per ITSM best practice). Priority is
derived and IT can override:
```
impact → base:  UNUSABLE=P1  MAJOR=P2  PARTIAL=P3  GENERAL=P4
category nudge: Security/Phishing/Malware → +1 level; Network/Server → +1 level
category.defaultPriority (if set) wins.  Agent override recomputes SLA.
```

## SLA
Per-priority policies (`SlaPolicy`): first-response & resolution targets,
warn-before window, escalation role, and whether to count business-hours only.
Seeded defaults: P1 15m/4h, P2 30m/8h, P3 4h/2d, P4 8h/5d.
- **Business hours** + **holidays** are configurable (Settings → IT Support →
  Business Hours). `addSlaMinutes` counts only working time when a policy is
  business-hours-only and skips holidays.
- **Pause/resume**: `WAITING_USER` / `WAITING_VENDOR` pause the SLA clock
  (configurable per policy); due dates shift forward on resume.
- The cron sweep (`/api/cron/checks` → `runSlaSweep`) flags warnings/breaches
  and notifies the assignee + IT managers (in-app + LINE for P1).

## Auto-assignment
A category can route to a `SupportTeam`; otherwise the default team is used.
Within a team the engine picks by **least workload** (open-case count), or
**round-robin** (team cursor). Managers can reassign; agents self-assign.

## Case numbering
`IT-<PREFIX>-<YEAR>-<000001>` sequential per org/year/type-prefix
(INC, REQ, ACC, HW, SW, ACT, NET, SEC, CHG, OTH).

## Surfaces
- **User portal** `/support`: my cases, `/support/new` (simple form —
  auto-fills requester profile + "my devices" from asset assignments),
  case detail with conversation/reply, confirm-resolved / reopen, CSAT survey.
- **IT queue** `/support/queue`: filterable work queue with SLA badges;
  `/support/metrics`: CSAT, SLA compliance, reopen rate, volume by
  priority/status/category/type.
- **Admin** `/settings/support`: 8 sections — case creation policy, types,
  categories, priority & SLA, teams (auto-assignment), workflow reference,
  business hours & holidays, notification events.

## REST API
`GET/POST /api/support` (list / create, `support:read` / `support:create`),
`GET /api/support/attachments/:id` (access-checked download).

## Not implemented (declared)
Inbound case creation from **Email/LINE OA** parsing (outbound notifications
to email/LINE work; web/mobile-PWA/manual/monitoring-API intake work).
AI text classification is a documented hook — current classification is
rule-based (impact + category). These can be added without schema changes.
