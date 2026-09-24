# Paper & Chalk

Realtime, collaborative ink for PDFs, notebooks and infinite whiteboards, in the browser.

> Early development. Every service runs; the marketing site, the app shell, sign-in, the data
> model and file uploads are in place. The editor comes next.

## Stack

| Part            | Tech                                                          |
| --------------- | ------------------------------------------------------------- |
| Web app         | Next.js (App Router), React, TypeScript, Tailwind, shadcn/ui  |
| Realtime sync   | Hocuspocus (Yjs)                                              |
| Background jobs | Node HTTP workers                                             |
| Data            | MongoDB (Atlas), Upstash Redis                                |
| Files           | Amazon S3 (private buckets, signed URLs)                      |
| Auth            | Better Auth: Google OAuth and email magic links (SMTP)         |

## Layout

```
apps/web             Next.js app (UI + API routes)
apps/sync            Hocuspocus WebSocket server
apps/workers         Background job service
packages/schema      Shared zod schemas and types
packages/engine      Canvas engine (framework-free)
packages/db          MongoDB client, migrations, permissions and repositories
packages/storage     S3 client, signed URLs, file-type checks, bucket setup
packages/sync-token  Sync-server identity tokens (sign / verify)
packages/config      Shared tsconfig, ESLint and Prettier config
```

## Getting started

Requirements: Node 24 (pinned in `.nvmrc`), pnpm 10, Docker Desktop.

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Fill in `.env` (MongoDB, Upstash, S3, auth and SMTP values; see the comments in `.env.example`).
`pnpm dev` starts a MongoDB in Docker that only the tests use, applies migrations to your
database, then runs:

- web: http://localhost:3000 (health: `/api/health`)
- sync: ws://localhost:1234 (health: `/health`)
- workers: http://localhost:8081 (health: `/health`, jobs: `POST /jobs/:kind`)

## Commands

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `pnpm dev`           | Local services + every app in watch mode                  |
| `pnpm typecheck`     | TypeScript across the workspace                           |
| `pnpm lint`          | ESLint across the workspace                               |
| `pnpm test`          | Vitest across the workspace (needs Docker and S3 access)  |
| `pnpm build`         | Production builds                                         |
| `pnpm db:migrate`    | Apply database migrations                                 |
| `pnpm db:seed`       | Demo data (`--reset` to recreate, `--remove` to delete)   |
| `pnpm storage:setup` | Create the S3 buckets and apply CORS and lifecycle rules  |

End-to-end tests (Playwright, against a production build; they start the workers too):

```sh
pnpm --filter @pc/web build
pnpm --filter @pc/web exec playwright install chromium   # first time only
pnpm --filter @pc/web e2e
```

## File storage

Files go straight from the browser to S3 and back through signed URLs; they never pass through
the web app.

**Uploading.** The browser hashes the file (SHA-256, in a Web Worker) and asks
`POST /api/uploads/init`. The server checks permission, type, size and the workspace owner's
storage quota. If the workspace already has a file with that hash it is reused. Otherwise:

- up to 16 MB: one signed `PUT`, bound to the content type, the exact size and the SHA-256
  (S3 rejects anything else);
- larger: an S3 multipart upload in 8 MB parts, each signed for its exact size. Uploads can be
  paused, resumed (even after a reload, by choosing the same file again) and cancelled; failed
  parts are retried with backoff and expired URLs are re-signed.

`POST /api/uploads/:id/complete` checks what reached S3, charges the quota and creates the asset.
A worker then checks the file's first bytes against its declared type (and re-hashes multipart
uploads). Mismatches are deleted and refunded. `GET /api/assets/:id/url` returns a 15-minute
signed read URL after a permission check.

**Buckets.** Five private buckets (`originals`, `yjs-snapshots`, `assets`, `exports`,
`thumbnails`), named by the `S3_BUCKET_*` variables. `pnpm storage:setup` creates any that are
missing and applies the rules below. Run it with AWS admin credentials (your CLI profile), not
the app's keys, and set `S3_CORS_ORIGINS` to the site origins first. It is safe to re-run.

| Bucket          | CORS (browser)                     | Lifecycle                                    |
| --------------- | ---------------------------------- | -------------------------------------------- |
| `originals`     | `GET`, `HEAD`, `PUT`; exposes ETag | abort unfinished multipart uploads after 1 day |
| `assets`        | `GET`, `HEAD`, `PUT`; exposes ETag | abort unfinished multipart uploads after 1 day |
| `exports`       | `GET`, `HEAD`                      | delete after 7 days                          |
| `thumbnails`    | `GET`, `HEAD`                      | delete after 30 days (regenerated on demand) |
| `yjs-snapshots` | none (server only)                 | abort unfinished multipart uploads after 1 day |

Every bucket blocks public access, enforces bucket-owner object ownership, encrypts with
SSE-S3, and deletes anything under `test/` after a day.

**Access.** The app uses an IAM user that can only read and write objects in these buckets.
Tests, CI and end-to-end runs use the same buckets but write only under `test/`; CI signs in
through GitHub OIDC with a role limited to `test/*`, so no AWS keys are stored in the repository.
