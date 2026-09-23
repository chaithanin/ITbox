# CLAUDE.md — Claude Code guidance for ITBox / TECHCORE

This is the Claude Code entry point for the **ITBox / TECHCORE Enterprise IT
Management System**. The full working context lives in **[AGENTS.md](./AGENTS.md)** —
read it first. This file adds the Claude-Code-specific essentials.

## Read first
- **[AGENTS.md](./AGENTS.md)** — architecture, stack, RBAC, security rules,
  integrations, deployment, conventions (the canonical context).
- `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `SECURITY.md`, `DEPLOYMENT.md`,
  `PRD.md`, `ROADMAP.md` — deeper per-topic docs.

## Golden rules (do not violate)
1. **Secrets → Vault only** (AES-256-GCM + KMS). Never store a password /
   passcode / API key / token in plaintext on an asset, note, or generic field,
   and never print one in logs, PDFs, exports, or commits. See AGENTS.md §6.
2. **RBAC is DB-derived and additive.** Adding a permission needs a *grant
   migration* for existing orgs, or gated pages 500 even for SUPER_ADMIN. See §5.
3. **Access-request / positions / default-permission = document-only.** It
   creates paperwork and records sign-offs; it must never grant real access.
4. **Verify before committing:** `npx tsc --noEmit && npm run build` must pass.
5. **Never commit secrets or secret-bearing import files.** Generate those in the
   scratchpad and hand them to the user; they import via the encrypting UI.

## Workflow expectations
- Work on branch `claude/enterprise-it-management-system-pz0u9s`; commit with
  clear messages and push. **Pushing auto-deploys** (Cloud Build → `itbox-migrate`
  → Cloud Run) — confirm the migrate step when a migration is included (AGENTS.md §8).
- After editing `prisma/schema.prisma`: add a migration + run `npx prisma generate`.
- Mutations = Server Actions in `actions.ts`; add a segment `error.tsx` where a
  `requirePermission` failure could otherwise white-screen.
- New PDF route → add it to `outputFileTracingIncludes` in `next.config.ts`.

## Handy commands
```bash
npm run dev · npm run build · npm run typecheck · npm run test · npm run test:e2e
npm run db:migrate · npm run db:deploy · npm run db:seed · npm run db:studio
```

## Attribution
End commit messages with the required `Co-Authored-By` trailer and keep any
model/session identifiers out of code, comments, and pushed artifacts.
