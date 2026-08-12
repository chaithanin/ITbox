# ITBox — Architecture

## Overview

ITBox is a multi-tenant Enterprise IT Management platform combining IT asset
management, an envelope-encrypted password/secret vault, license & subscription
management, maintenance, procurement with approval workflow, offboarding, audit
and a security center — in a single Next.js 15 application backed by PostgreSQL.

## System architecture (GCP)

```
Internet
    |
    v
Cloud Load Balancer (HTTPS, managed cert)
    |
    v
Cloud Run  ──────────────────────────────┐
    ├── Next.js frontend (App Router)    │
    ├── REST API (/api/*)                │  Cloud Logging / Monitoring
    └── Business logic (service layer)   │
    |                                    │
    v                                    │
Cloud SQL for PostgreSQL  (private IP / auth proxy)
Cloud Storage             (asset images, documents, reports)
Cloud KMS                 (vault DEK wrapping — envelope encryption)
Secret Manager            (DATABASE_URL, AUTH_SECRET, OAuth, LINE credentials)
Artifact Registry         (container images)
Cloud Scheduler ──POST──> /api/cron/checks (daily notifications job)
```

## Application layers

```
app/(app)/**/page.tsx         server components (org-scoped queries, RBAC-gated)
app/(app)/**/actions.ts       server actions ("use server", zod, audit)
app/api/**                    REST API for external integration (apiHandler)
lib/services/*                domain services (vault, notify)
lib/{session,audit,api}.ts    authn/authz, audit log, API error handling
lib/crypto/*                  envelope encryption + KMS providers
prisma/*                      schema, migrations, seed
```

Request flow for every protected entry point:

```
request → middleware (JWT cookie check, edge)
        → getCurrentUser() (revocable session check, user status, roles+permissions)
        → requirePermission("<resource>:<action>")
        → org-scoped Prisma query (organizationId + deletedAt filters)
        → auditLog() on mutations
```

## Multi-tenancy

Every business table carries `organizationId`. All queries filter by the
caller's organization; cross-tenant access is covered by integration tests
(`tests/vault-access.integration.test.ts`). Roles are per-organization; the
permission catalog is global (`lib/permissions.ts`).

## Scalability

- Cloud Run autoscaling (stateless app; sessions are JWT + DB-checked).
- All list endpoints paginate server-side; dashboards aggregate in SQL.
- Indexes on all hot paths (`organizationId + status`, tags, rotation dates).
- The in-memory rate limiter is per-instance defense-in-depth; put Cloud Armor
  in front for global limits.
- Scale path 100 → 5,000+ users: raise Cloud Run max instances and Cloud SQL
  tier; no application rewrite required.
