# Contributing

## Prerequisites

- **Node.js 22** (matches the Docker runtime).
- **PostgreSQL 16** (local or a container).
- npm (the repo uses `package-lock.json`).

## Local setup

```bash
# 1. install
npm ci

# 2. env — copy and fill in
cp .env.example .env
#   at minimum: DATABASE_URL, AUTH_SECRET (openssl rand -base64 32),
#   AUTH_URL=http://localhost:3000, AUTH_TRUST_HOST=true, STORAGE_PROVIDER=local

# 3. database
npm run db:deploy          # apply migrations
SEED_ADMIN_PASSWORD=… SEED_USER_PASSWORD=… npm run db:seed

# 4. run
npm run dev                # http://localhost:3000
```

Demo logins after seeding: `admin@example.com` (SUPER_ADMIN), plus
`itmanager@ / itstaff@ / security@ / hr@ / employee@example.com`.

## Everyday commands

| Command | Does |
|---|---|
| `npm run dev` | Dev server (HMR). |
| `npm run build` | Production build (also the deploy gate). |
| `npm run start` | Serve a production build. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm run lint` | ESLint (`next lint`). |
| `npm test` | Unit tests (Vitest). |
| `npm run test:e2e` | Playwright E2E. |
| `npm run db:migrate` | Create+apply a dev migration. |
| `npm run db:deploy` | Apply pending migrations. |
| `npm run db:seed` | Seed demo data. |
| `npm run db:studio` | Prisma Studio. |

## Project conventions

- **Read in pages, write in actions.** RSC `page.tsx` reads models; `"use server"`
  `actions.ts` mutate. Actions must:
  1. `requirePermission("x:y")`,
  2. validate input with **Zod**,
  3. wrap concurrent state changes in `$transaction` + `SELECT … FOR UPDATE`,
  4. `auditLog(...)`,
  5. `revalidatePath(...)` / `redirect(...)`.
- **Multi-tenancy:** every query filters by `organizationId` (the caller's).
  Never trust an id alone.
- **Permissions live in the DB.** Adding a permission key in
  `src/lib/permissions.ts` also requires:
  - adding it to `prisma/seed.ts` (for fresh orgs), **and**
  - a data migration granting it to existing orgs' roles
    (see `20260902130000_borrow_permissions_grant`).
- **Server Actions & forms:** carry decision/intent in **hidden inputs**, not
  submit-button `name`/`value` (those aren't delivered to Server Actions here).
- **Bilingual UI:** user-facing strings are Thai / English (`ไทย / English`).
  Use `getT()` / the i18n dictionary for nav and shared labels.
- **PDFs:** use `pdfkit` with the bundled Thai font
  (`src/assets/fonts/NotoSansThai-Regular.ttf`), constructed with `font: ""` so
  Helvetica's metric files aren't required in the standalone bundle. Keep drawn
  content inside the page margins (text below the bottom margin auto-paginates).
- **Style:** match surrounding code — Tailwind + Radix primitives in
  `src/components/ui`, `lucide-react` icons, `cn()` for class merging.

## Adding a new module (checklist)

1. Prisma models + `@@map`, indexes, `organizationId`, `deletedAt` → **migration**.
2. Permission keys in `src/lib/permissions.ts` + `ROLE_PERMISSIONS`, mirror in
   `prisma/seed.ts`, and a grant migration for existing orgs.
3. `StatusBadge` entries for new statuses (`src/components/status-badge.tsx`).
4. Nav item in `src/app/(app)/layout.tsx` + icon in `src/components/shell/sidebar.tsx`
   + module-registry entry in `src/lib/modules.ts`.
5. Pages (`page.tsx`), actions (`actions.ts`), any service logic in `src/lib/...`.
6. Reports (add a builder in `src/app/api/reports/[report]/route.ts`).
7. `npm run typecheck && npm run lint && npm run build`.

## Testing before a PR

Run and pass locally:

```bash
npm run typecheck && npm run lint && npm run build && npm test
```

For UI/flow changes, a quick standalone smoke test is valuable: build, run
`node .next/standalone/server.js` against a seeded DB, and drive the flow (the
repo's Playwright setup and Chromium are available).

## Git & CI

- Branch from the current default; do not push directly to `main` without review.
- Commits: concise, imperative subject + a body explaining **why**.
- CI deploys on push to `main` / the active feature branch (docs-only pushes are
  skipped). A failing migration or build blocks the deploy.
- See `CONVENTIONS.md` for additional house style.
