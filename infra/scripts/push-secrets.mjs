#!/usr/bin/env node
/**
 * Puts secret values where the deployed services read them: GCP Secret Manager (web, sync) and
 * SSM Parameter Store (the workers Lambda). Values never appear in Terraform, the repo, argv or
 * the output; only secret names and what happened to them are printed.
 *
 *   node infra/scripts/push-secrets.mjs --env staging --project paper-chalk-staging \
 *     --from .env --mongo-database PaperStaging
 *
 * - Values come from the --from file (same variable names as the app's .env).
 * - MONGODB_URI gets its database replaced by --mongo-database, so environments never share data.
 * - BETTER_AUTH_SECRET and SYNC_JWT_SECRET are generated per environment (once), never copied.
 * - A new version is added only when the value changed. Empty values are skipped (e.g. Google
 *   OAuth before its client exists).
 */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values: args } = parseArgs({
  options: {
    env: { type: "string" },
    project: { type: "string" },
    from: { type: "string", default: ".env" },
    "mongo-database": { type: "string" },
    "aws-region": { type: "string", default: "ap-south-1" },
  },
});
if (!args.env || !args.project || !args["mongo-database"]) {
  console.error(
    "usage: push-secrets.mjs --env <name> --project <gcp-project> --mongo-database <db> [--from .env]",
  );
  process.exit(1);
}

const isWindows = process.platform === "win32";
function run(command, commandArgs, input) {
  const result = spawnSync(command, commandArgs, {
    input,
    encoding: "utf8",
    shell: isWindows,
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { ok: result.status === 0, out: result.stdout ?? "", err: result.stderr ?? "" };
}

function readEnvFile(path) {
  const values = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2].replace(/^"(.*)"$/, "$1");
  }
  return values;
}

function withDatabase(uri, database) {
  const url = new URL(uri);
  url.pathname = `/${database}`;
  return url.toString();
}

const source = readEnvFile(args.from);
const mongoUri = source.MONGODB_URI ? withDatabase(source.MONGODB_URI, args["mongo-database"]) : "";

/** secret id => value (null: generate once if missing). */
const secrets = {
  "mongodb-uri": mongoUri,
  "better-auth-secret": null,
  "sync-jwt-secret": null,
  "upstash-redis-rest-url": source.UPSTASH_REDIS_REST_URL ?? "",
  "upstash-redis-rest-token": source.UPSTASH_REDIS_REST_TOKEN ?? "",
  "smtp-user": source.SMTP_USER ?? "",
  "smtp-password": source.SMTP_PASSWORD ?? "",
  "email-from": source.EMAIL_FROM ?? "",
  "google-client-id": source.GOOGLE_CLIENT_ID ?? "",
  "google-client-secret": source.GOOGLE_CLIENT_SECRET ?? "",
};

const gcp = ["--project", args.project, "--quiet"];
for (const [id, wanted] of Object.entries(secrets)) {
  const current = run("gcloud", [
    "secrets",
    "versions",
    "access",
    "latest",
    "--secret",
    id,
    ...gcp,
  ]);
  const existing = current.ok ? current.out : null;
  let value = wanted;
  if (value === null) {
    if (existing) {
      console.info(`${id}: kept (generated earlier)`);
      continue;
    }
    value = randomBytes(32).toString("base64url");
  }
  if (!value) {
    console.info(`${id}: skipped (no value)`);
    continue;
  }
  if (existing === value) {
    console.info(`${id}: unchanged`);
    continue;
  }
  const added = run("gcloud", ["secrets", "versions", "add", id, "--data-file=-", ...gcp], value);
  if (!added.ok) {
    console.error(`${id}: FAILED\n${added.err}`);
    process.exitCode = 1;
    continue;
  }
  console.info(`${id}: ${wanted === null ? "generated" : existing === null ? "set" : "updated"}`);
}

// The workers Lambda reads the MongoDB URI from SSM.
if (mongoUri) {
  const name = `/paper-chalk/${args.env}/mongodb-uri`;
  const aws = ["--region", args["aws-region"]];
  const current = run("aws", [
    "ssm",
    "get-parameter",
    "--name",
    name,
    "--with-decryption",
    "--query",
    "Parameter.Value",
    "--output",
    "text",
    ...aws,
  ]);
  if (current.ok && current.out.trim() === mongoUri) {
    console.info(`ssm ${name}: unchanged`);
  } else {
    // Via a private temp file: values on the command line are visible to other processes.
    const dir = mkdtempSync(join(tmpdir(), "pc-secret-"));
    const file = join(dir, "value");
    try {
      writeFileSync(file, mongoUri, { mode: 0o600 });
      const put = run("aws", [
        "ssm",
        "put-parameter",
        "--name",
        name,
        "--type",
        "SecureString",
        "--overwrite",
        "--value",
        `file://${file.replaceAll("\\", "/")}`,
        ...aws,
      ]);
      if (put.ok) console.info(`ssm ${name}: set`);
      else {
        console.error(`ssm ${name}: FAILED\n${put.err}`);
        process.exitCode = 1;
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }
}
