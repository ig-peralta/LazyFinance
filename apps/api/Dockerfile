# ─── base: pnpm + Node toolchain ────────────────────────────────────────────
FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN npm install -g turbo@2.10.11

# ─── prune: generate the minimal monorepo subset for the API ────────────────
FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune --docker api

# ─── deps: install the dependencies needed to build the API ─────────────────
FROM base AS deps
WORKDIR /app
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# ─── build: compile the API ─────────────────────────────────────────────────
FROM deps AS build
WORKDIR /app
COPY --from=pruner /repo/out/full/ ./
RUN turbo run build --filter=api...

# ─── prod: retain only production dependencies and build output ─────────────
FROM deps AS prod
WORKDIR /app
COPY --from=pruner /repo/out/json/ ./
COPY --from=build /app /app
ENV CI=true
RUN pnpm install --frozen-lockfile --prod --ignore-scripts \
 && rm -rf .turbo apps/api/.turbo

# ─── runner: minimal non-root runtime image ─────────────────────────────────
FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV PORT=3000

RUN addgroup -g 1001 -S nodejs \
 && adduser -u 1001 -S nodejs -G nodejs

WORKDIR /app
COPY --from=prod --chown=nodejs:nodejs /app /app

USER nodejs

EXPOSE 3000
CMD ["node", "apps/api/dist/src/main.js"]
