FROM node:22-alpine AS base
ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
RUN npm install -g turbo@2.10.11

FROM base AS pruner
WORKDIR /repo
COPY . .
RUN turbo prune --docker persistence

FROM base AS build
WORKDIR /app
COPY --from=pruner /repo/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts
COPY --from=pruner /repo/out/full/ ./
# Uses committed generated types. No native generator or other app is required.
RUN turbo run build --filter=persistence...
RUN pnpm --filter persistence deploy --prod /runtime

FROM node:22-alpine AS runner
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001
WORKDIR /app
COPY --from=build --chown=node:node /runtime/ ./
USER node
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=3s CMD node -e "fetch('http://127.0.0.1:3001/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"
CMD ["node", "dist/main.js"]
