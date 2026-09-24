#!/usr/bin/env node
// `pnpm dev`: apply migrations to the dev database, then run every app in watch mode.
// Everything runs against the cloud services in .env (Atlas, Upstash, S3); no Docker needed.
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const isWindows = process.platform === "win32";

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

function run(command, args, label) {
  console.info(`→ ${label}`);
  const result = spawnSync(command, args, { stdio: "inherit", shell: isWindows });
  if (result.status !== 0) fail(`${label} failed.`);
}

if (!existsSync(".env")) {
  fail("No .env file. Run: cp .env.example .env");
}

run("pnpm", ["db:migrate"], "Applying database migrations (MONGODB_URI)");

console.info("→ Starting web (3000), sync (1234) and workers (8081)\n");
const child = spawn("pnpm", ["turbo", "run", "dev", "--ui=stream"], {
  stdio: "inherit",
  shell: isWindows,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    child.kill(signal);
  });
}
child.on("exit", (code) => {
  process.exit(code ?? 0);
});
