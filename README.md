# Paper & Chalk

Realtime, collaborative ink for PDFs, notebooks and infinite whiteboards, in the browser.

> Early development. Every service runs; the marketing site and the app shell are in place. The editor comes next.

## Stack

| Part            | Tech                                                           |
| --------------- | -------------------------------------------------------------- |
| Web app         | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui   |
| Realtime sync   | Hocuspocus (Yjs)                                               |
| Background jobs | Node HTTP workers, called as Cloud Tasks targets               |
| Data            | Postgres + pgvector (Drizzle ORM), Redis, Google Cloud Storage |
| Hosting         | Google Cloud Run                                               |

## Layout

```
apps/web         Next.js app (UI + API routes)
apps/sync        Hocuspocus WebSocket server
apps/workers     Background job service
packages/schema  Shared zod schemas and types
packages/engine  Canvas engine (framework-free)
packages/db      Drizzle client and migrations
packages/config  Shared tsconfig, ESLint and Prettier config
```

## Getting started

Requirements: Node 24 (pinned in `.nvmrc`), pnpm 10, Docker Desktop.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

`pnpm dev` starts Postgres, Redis and a local GCS emulator in Docker, applies migrations, then runs:

- web: http://localhost:3000 (health: `/api/health`)
- sync: ws://localhost:1234 (health: `/health`)
- workers: http://localhost:8081 (health: `/health`, jobs: `POST /jobs/:kind`)

## Commands

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `pnpm dev`         | Local services + every app in watch mode      |
| `pnpm typecheck`   | TypeScript across the workspace               |
| `pnpm lint`        | ESLint across the workspace                   |
| `pnpm test`        | Vitest across the workspace (needs Docker up) |
| `pnpm build`       | Production builds                             |
| `pnpm db:migrate`  | Apply database migrations                     |
| `pnpm db:studio`   | Open Drizzle Studio                           |

End-to-end tests (Playwright, against a production build):

```sh
pnpm --filter @pc/web build
pnpm --filter @pc/web exec playwright install chromium   # first time only
pnpm --filter @pc/web e2e
```
