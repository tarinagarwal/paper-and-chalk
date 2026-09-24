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
| Hosting         | Google Cloud Run (web, sync), AWS Lambda (workers), Mumbai    |

## Layout

```
apps/web             Next.js app (UI + API routes)
apps/sync            Hocuspocus WebSocket server
apps/workers         Background jobs (AWS Lambda from SQS; HTTP locally)
infra                Terraform: environments, bucket module, bootstrap and secret scripts
packages/schema      Shared zod schemas and types
packages/engine      Canvas engine (framework-free)
packages/db          MongoDB client, migrations, permissions and repositories
packages/storage     S3 client, signed URLs, file-type checks, AWS credentials
packages/sync-token  Sync-server identity tokens (sign / verify)
packages/config      Shared tsconfig, ESLint and Prettier config
```

## Getting started

Requirements: Node 24 (pinned in `.nvmrc`) and pnpm 10. No Docker: development uses the cloud
services in `.env`, and tests start a throwaway MongoDB of their own (downloaded once).

```sh
pnpm install
cp .env.example .env
pnpm dev
```

Fill in `.env` (MongoDB, Upstash, S3, auth and SMTP values; see the comments in `.env.example`).
`pnpm dev` applies migrations to your database, then runs:

- web: http://localhost:3000 (health: `/api/health`)
- sync: ws://localhost:1234 (health: `/health`)
- workers: http://localhost:8081 (health: `/health`, jobs: `POST /jobs/:kind`)

## Commands

| Command              | What it does                                              |
| -------------------- | --------------------------------------------------------- |
| `pnpm dev`           | Migrations + every app in watch mode                      |
| `pnpm typecheck`     | TypeScript across the workspace                           |
| `pnpm lint`          | ESLint across the workspace                               |
| `pnpm test`          | Vitest across the workspace (needs S3 access)             |
| `pnpm build`         | Production builds                                         |
| `pnpm db:migrate`    | Apply database migrations                                 |
| `pnpm db:seed`       | Demo data (`--reset` to recreate, `--remove` to delete)   |

End-to-end tests (Playwright, against a production build; they start a test MongoDB and the
workers too):

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

**Buckets.** Five private buckets per environment (`originals`, `yjs-snapshots`, `assets`,
`exports`, `thumbnails`), named by the `S3_BUCKET_*` variables and defined once in Terraform
(`infra/modules/s3-buckets`, used by `infra/envs/dev` and every deployed environment):

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

## Deployment

Every push to `main` that passes CI deploys to **staging** (`.github/workflows/deploy-staging.yml`):
images are built, database migrations run, the workers and both services are updated, and a smoke
test checks health, the deployed release and a real `wss` document sync. Infrastructure is
Terraform in `infra/` (one module per environment, applied by hand after reviewing the plan; CI
never runs `terraform apply`).

| Piece               | Runs on                                                         |
| ------------------- | --------------------------------------------------------------- |
| Web app (Next.js)   | Google Cloud Run, Mumbai, scales to zero                        |
| Sync (Hocuspocus)   | Google Cloud Run, Mumbai, websockets and session affinity       |
| Workers             | AWS Lambda (arm64), Mumbai, fed by SQS with a dead-letter queue |
| Database            | MongoDB Atlas (AWS Mumbai)                                      |
| Redis               | Upstash                                                         |
| Files               | Amazon S3, Mumbai                                               |
| Secrets             | GCP Secret Manager (web, sync), SSM Parameter Store (workers)   |

Everything sits in one city, so the web app's database calls and the workers' file reads are
fast and free of egress charges. No cloud keys are stored anywhere: GitHub signs in to GCP and AWS
with OIDC, the workers use their Lambda role, and the web app exchanges its Google service-account
identity for a short AWS session. Every service reports its release (the git SHA) on its health
endpoint and in its JSON logs.

### New environment from zero

You need: `gcloud`, `aws` and `terraform` (1.10+) signed in with admin rights, a MongoDB Atlas
cluster, an Upstash Redis database and an SMTP account. The GitHub OIDC provider for AWS exists
once per AWS account (see `infra/envs/dev`). Below, `<env>` is the environment name (for example
`production`) and `<project>` its Google Cloud project.

1. **Google Cloud project**: `gcloud projects create <project>`, then link a billing account
   (`gcloud billing projects link <project> --billing-account <id>`).
2. **Bootstrap**: `infra/bootstrap/gcp.sh <project>` enables the APIs Terraform needs and creates
   the versioned Terraform state bucket `gs://<project>-tfstate`.
3. **Terraform config**: copy `infra/envs/staging` to `infra/envs/<env>` and change the project,
   the state bucket, `name`, the GitHub OIDC subject (`...:environment:<env>`) and the sizing
   (production: `sync_min_instances = 1`, `force_destroy_buckets = false`).
4. **Foundation**: in `infra/envs/<env>`, run `terraform init` and
   `terraform apply -var services_enabled=false`. If your application-default Google login is a
   different account, prefix Terraform commands with
   `GOOGLE_OAUTH_ACCESS_TOKEN=$(gcloud auth print-access-token)`.
5. **Secrets**: put the environment's values in a file with the same names as `.env`
   (`MONGODB_URI`, `UPSTASH_REDIS_REST_*`, `SMTP_USER`, `SMTP_PASSWORD`, `EMAIL_FROM`,
   `GOOGLE_CLIENT_*`), then run
   `node infra/scripts/push-secrets.mjs --env <env> --project <project> --from <file> --mongo-database <db>`.
   It generates the auth and sync-token secrets itself and prints only names, never values.
6. **Services**: `terraform apply` creates the Cloud Run services (on a placeholder image).
7. **GitHub**: create the environment (`gh api -X PUT repos/<owner>/<repo>/environments/<env>`) and
   set its variables from `terraform output github_variables`
   (`gh variable set <NAME> --env <env> --body <value>` for each).
8. **First deploy**: run the deploy workflow (a copy of `deploy-staging.yml` for `<env>`). It
   builds and pushes the images, migrates, deploys web and sync, and warns that the workers
   function does not exist yet.
9. **Workers**: set `workers_image_tag` in `infra/envs/<env>/main.tf` to the release SHA that
   deploy pushed, and `terraform apply`. This creates the Lambda function and its SQS trigger;
   later deploys update it.
10. **Google sign-in**: create an OAuth client (type "Web application") with the redirect URI
    `<web url>/api/auth/callback/google`, add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` to the
    values file, re-run step 5, then set `google_oauth_enabled = true` and `terraform apply`.
11. **Custom domains** (optional): verify the domain with Google, set `web_domain` and
    `sync_domain`, apply, and add the DNS records Cloud Run gives you.

Atlas must accept connections from anywhere (`0.0.0.0/0`, with its password and TLS): Cloud Run,
Lambda and GitHub runners have no fixed addresses, and fixed egress addresses cost about $30 a
month per environment.
