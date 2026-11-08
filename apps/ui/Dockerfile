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

# ─── build: prerender public content and compile client routes ──────────────
FROM deps AS build
WORKDIR /app
COPY --from=pruner /repo/out/full/ ./
RUN turbo run build --filter=ui...

# ─── runner: static hosting, no request-time Angular/Node runtime ────────────
FROM nginxinc/nginx-unprivileged:1.28-alpine AS runner
COPY apps/ui/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/ui/dist/ui/browser /usr/share/nginx/html
EXPOSE 4000
