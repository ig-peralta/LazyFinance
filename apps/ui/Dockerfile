# ─── base: pnpm + Node toolchain ────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN npm install -g turbo@2.10.11

# ─── prune: generate the minimal monorepo subset for the UI ─────────────────
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune --docker ui

# ─── deps: install the dependencies needed to build the UI ──────────────────
FROM base AS deps
WORKDIR /app
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── build: compile the Angular app and its SSR server ───────────────────────
FROM deps AS build
WORKDIR /app
COPY --from=pruner /repo/out/full/ ./
RUN turbo run build --filter=ui...

# ─── prod: retain production dependencies and built assets ──────────────────
FROM deps AS prod
WORKDIR /app
COPY --from=pruner /repo/out/json/ ./
COPY --from=build /app /app
ENV CI=true
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
 && rm -rf .turbo apps/ui/.turbo apps/ui/.angular apps/ui/src apps/ui/public

# ─── runner: minimal non-root SSR runtime image ──────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nodejs -G nodejs

WORKDIR /app
COPY --from=prod --chown=nodejs:nodejs /app /app

USER nodejs

EXPOSE 4000
CMD ["node", "apps/ui/dist/ui/server/server.mjs"]
