import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

test("rendered seed SQL is accepted by remote D1 imports", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "sub-store-seed-test-"));
  const outputPath = join(outputDirectory, "seed.sql");

  try {
    execFileSync(
      process.execPath,
      ["scripts/render-seed-sql.mjs", "config/agent-setup.example.json", outputPath],
      { cwd: repositoryRoot, stdio: "pipe" },
    );
    const sql = readFileSync(outputPath, "utf8");
    assert.doesNotMatch(sql, /^\s*(?:BEGIN|COMMIT|END|SAVEPOINT)\b/im);
    assert.match(sql, /INSERT INTO sources/);
    assert.match(sql, /INSERT INTO collections/);
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});
