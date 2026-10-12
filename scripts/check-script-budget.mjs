import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { gzipSync } from "node:zlib";

const FREE_LIMIT_BYTES = 3 * 1024 * 1024;
const RELEASE_BUDGET_BYTES = Math.floor(2.5 * 1024 * 1024);
const outdir = mkdtempSync(join(tmpdir(), "sub-store-script-budget-"));

try {
  const generated = runPnpm(["run", "scripts:generate"]);
  if (generated.status !== 0) fail(commandError(generated));

  const bundled = runPnpm(
    ["--dir", "cloudflare", "exec", "wrangler", "deploy", "--dry-run", "--outdir", outdir, "--config", "../wrangler.jsonc"],
  );
  if (bundled.status !== 0) fail(commandError(bundled));

  const worker = readFileSync(join(outdir, "index.js"));
  const compressedBytes = gzipSync(worker).byteLength;
  if (compressedBytes > RELEASE_BUDGET_BYTES) {
    fail(`Worker gzip size ${compressedBytes} exceeds the ${RELEASE_BUDGET_BYTES} byte release budget`);
  }

  console.log(JSON.stringify({
    compressedBytes,
    releaseBudgetBytes: RELEASE_BUDGET_BYTES,
    freeLimitBytes: FREE_LIMIT_BYTES,
    headroomBytes: FREE_LIMIT_BYTES - compressedBytes,
  }, null, 2));
} finally {
  rmSync(outdir, { recursive: true, force: true });
}

function fail(message) {
  console.error(String(message).trim());
  process.exit(1);
}

function runPnpm(args) {
  const pnpmEntry = process.env.npm_execpath;
  const command = pnpmEntry ? process.execPath : process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const commandArgs = pnpmEntry ? [pnpmEntry, ...args] : args;
  return spawnSync(command, commandArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

function commandError(result) {
  return result.error?.stack || result.stderr || result.stdout || `Command exited with status ${result.status}`;
}
