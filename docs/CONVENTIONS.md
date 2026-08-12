# ITBox Development Conventions

Read this before adding any module. Follow the existing foundation — do not modify shared files.

## Stack
Next.js 15 App Router + TypeScript strict + Tailwind + Prisma 6 (PostgreSQL). Path alias `@/*` → `src/*`.

## Do NOT modify these shared files (add new files only)
`src/lib/*` (prisma, session, audit, api, permissions, i18n, utils, password, crypto/*, services/vault),
`src/auth*.ts`, `src/middleware.ts`, `src/components/ui/*`, `src/components/shell/*`,
`src/app/layout.tsx`, `src/app/(app)/layout.tsx`, `prisma/schema.prisma`, `prisma/seed.ts`, `package.json`.
If something seems missing there, work around it locally in your own files.

## Authorization — every server entry point
```ts
import { requirePermission, requireUser, getCurrentUser } from "@/lib/session";
const user = await requirePermission("asset:read"); // throws AuthError(401/403)
```
Permission keys: see `src/lib/permissions.ts`. ALWAYS scope Prisma queries with
`organizationId: user.organizationId` and `deletedAt: null` (soft delete).

## Audit — every mutation
```ts
import { auditLog } from "@/lib/audit";
await auditLog(user, { action: "CREATE", entityType: "ASSET", entityId: asset.id, detail: { assetTag } });
```
Never put passwords/secrets/tokens/keys in `detail` (sanitizer strips them, but don't rely on it).

## Pages (server components)
Location: `src/app/(app)/<module>/page.tsx`, `[id]/page.tsx`, `new/page.tsx`, `[id]/edit/page.tsx`.
List pages: `searchParams` is a Promise in Next 15 — `const sp = await searchParams;`.
Use pagination (default 20/page) via `parsePage`, `Pagination`, `SearchFilterBar` from `@/components/list-controls`.
On `AuthError` from missing permission, pages naturally 500 — instead check `user.permissions.has(...)` and render a "no access" note, or call requirePermission inside try/catch → `redirect("/dashboard")`.

## Server actions (mutations) — colocate in `actions.ts` with `"use server"` at top
```ts
"use server";
import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requirePermission } from "@/lib/session";
import { auditLog } from "@/lib/audit";

const schema = z.object({ name: z.string().min(1).max(200) /* ... */ });

export async function createThing(formData: FormData) {
  const user = await requirePermission("asset:create");
  const input = schema.parse(Object.fromEntries(formData));
  const row = await prisma.asset.create({ data: { ...input, organizationId: user.organizationId } });
  await auditLog(user, { action: "CREATE", entityType: "ASSET", entityId: row.id });
  revalidatePath("/assets");
  redirect(`/assets/${row.id}`);
}
```
Forms: plain `<form action={createThing}>` in server components with UI components.
Optional/nullable fields: `z.string().optional()` then convert `"" → null`. Dates: `<Input type="date">`, parse with `new Date(v)`. Numbers: `z.coerce.number()`.

## REST API (external integration) — `src/app/api/<resource>/route.ts`
```ts
import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api";
import { requirePermission } from "@/lib/session";

export const GET = apiHandler(async (req: Request) => {
  const user = await requirePermission("asset:read");
  // parse req.url searchParams; paginate; return NextResponse.json({ data, page, total })
});
```
`apiHandler` maps AuthError→401/403, ZodError→400. Rate limit heavy endpoints with `checkRateLimit` from `@/lib/rate-limit`.

## UI components available
`@/components/ui/*`: Button, Input, Textarea, Select (native styled), Label, Card(+Header/Title/Description/Content), Badge, Table(+Header/Body/Row/Head/Cell), Dialog, Tabs, DropdownMenu.
`@/components/*`: PageHeader, StatCard, StatusBadge (knows all enum statuses), SearchFilterBar, Pagination, parsePage, ConfirmButton.
Utils: `cn, formatDate, formatDateTime, formatMoney, daysUntil` from `@/lib/utils`.
Icons: `lucide-react`.

## Language
Bilingual inline labels: primary Thai, secondary English, e.g. `ทรัพย์สิน / Assets` or short Thai with English in description. Keep enum values English (StatusBadge renders them).

## Style
Mobile-first, responsive (tables already scroll horizontally). Dark mode works automatically via CSS vars — use semantic tailwind colors (bg-card, text-muted-foreground, etc.), never hard-coded hex.
Decimal fields (Prisma) — render with `formatMoney()`; never pass Decimal objects to client components.

## Verify your work
Run ONLY `npx tsc --noEmit` (never `next build`, never `prisma migrate`, never modify the DB schema).
