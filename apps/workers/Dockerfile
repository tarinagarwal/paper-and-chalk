# syntax=docker/dockerfile:1.7
# Workers as an AWS Lambda container image (jobs arrive from SQS). Build from the repo root:
#   docker build -f apps/workers/Dockerfile --platform linux/arm64 --build-arg RELEASE=<sha> .
# Every stage uses the Lambda base image so native modules (@node-rs/argon2) are built for its
# C library (glibc on Amazon Linux), not Alpine's.
ARG LAMBDA_BASE=public.ecr.aws/lambda/nodejs:24

FROM ${LAMBDA_BASE} AS base
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

FROM ${LAMBDA_BASE} AS runtime
ARG RELEASE=dev
ENV NODE_ENV=production RELEASE=${RELEASE}
COPY --from=build /out/ ${LAMBDA_TASK_ROOT}/
CMD ["dist/lambda.handler"]
