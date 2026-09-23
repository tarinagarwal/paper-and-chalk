# syntax=docker/dockerfile:1.7
# Build from the repo root: docker build -f apps/workers/Dockerfile .
ARG NODE_VERSION=24.21.0

FROM node:${NODE_VERSION}-alpine AS base
RUN corepack enable
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH
WORKDIR /repo

# Keep only what @pc/workers needs from the monorepo.
FROM base AS prune
COPY . .
RUN pnpm dlx turbo@2.11.3 prune @pc/workers --docker

FROM base AS build
COPY --from=prune /repo/out/json/ .
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY --from=prune /repo/out/full/ .
RUN pnpm turbo run build --filter=@pc/workers
# Isolated production install: dist/ plus runtime dependencies only.
RUN pnpm --filter @pc/workers deploy --prod --legacy /out

FROM node:${NODE_VERSION}-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build --chown=node:node /out ./
USER node
EXPOSE 8080
CMD ["node", "dist/index.js"]
