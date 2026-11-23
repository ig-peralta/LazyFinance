FROM node:22-alpine

ENV PNPM_HOME=/pnpm
ENV PATH="${PNPM_HOME}:${PATH}"
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts
RUN pnpm exec turbo build --filter=api... --filter=persistence...
