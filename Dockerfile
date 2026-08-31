# ITBox — production image for Cloud Run
# Multi-stage build; final image runs the Next.js standalone server as non-root.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
COPY prisma ./prisma
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time env placeholders (real secrets are injected at runtime by Cloud Run)
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV AUTH_SECRET="build-placeholder"
RUN npx prisma generate && npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080
# Render all server-side dates in Thailand time. Node 22 ships full ICU, so this
# resolves via bundled tz data with no OS tzdata package needed. Business-hours
# / SLA math uses its own explicit offset and is unaffected.
ENV TZ=Asia/Bangkok

RUN groupadd -r nodejs && useradd -r -g nodejs nextjs

# Standalone server + static assets
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Thai font for PDF report export (read at runtime relative to cwd)
COPY --from=builder --chown=nextjs:nodejs /app/src/assets ./src/assets
# Prisma CLI + engines + migrations for `prisma migrate deploy` (Cloud Run job:
# node node_modules/prisma/build/index.js migrate deploy).
# The CLI needs these transitive deps at runtime (verified by running the CLI
# against a tree containing only this set):
COPY --from=builder --chown=nextjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/prisma ./node_modules/prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@prisma ./node_modules/@prisma
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/@standard-schema ./node_modules/@standard-schema
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/c12 ./node_modules/c12
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/confbox ./node_modules/confbox
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/deepmerge-ts ./node_modules/deepmerge-ts
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/defu ./node_modules/defu
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/destr ./node_modules/destr
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/dotenv ./node_modules/dotenv
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/effect ./node_modules/effect
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/empathic ./node_modules/empathic
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/exsolve ./node_modules/exsolve
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/fast-check ./node_modules/fast-check
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/jiti ./node_modules/jiti
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pathe ./node_modules/pathe
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/perfect-debounce ./node_modules/perfect-debounce
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pkg-types ./node_modules/pkg-types
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/pure-rand ./node_modules/pure-rand
COPY --from=builder --chown=nextjs:nodejs /app/node_modules/rc9 ./node_modules/rc9

USER nextjs
EXPOSE 8080
CMD ["node", "server.js"]
