import { execFileSync, spawnSync } from "node:child_process";
import { denyPatterns, skippedHistoryPaths } from "./open-source-denylist.mjs";

const revisions = process.argv.slice(2).filter((arg) => arg !== "--");
const revListArgs = revisions.length > 0 ? revisions : ["--all"];
const commits = execFileSync("git", ["rev-list", ...revListArgs], { encoding: "utf8" })
  .trim()
  .split(/\s+/)
  .filter(Boolean);

const findings = [];

for (const [pattern, label] of denyPatterns) {
  const args = ["grep", "-I", "-n", "-E"];
  if (pattern.flags.includes("i")) args.push("-i");
  args.push("-e", pattern.source, ...commits, "--", ".", ...skippedHistoryPaths.map((path) => `:!${path}`));

  const result = spawnSync("git", args, { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error) throw result.error;
  if (result.status === 1) continue;
  if (result.status !== 0) {
    console.error(result.stderr || `git grep exited with status ${result.status}`);
    process.exit(1);
  }

  findings.push(...result.stdout.split(/\r?\n/).filter(Boolean).map((line) => `${label}: ${line}`));
}

if (findings.length > 0) {
  console.error(findings.join("\n"));
  console.error("\nGit history contains private deployment details. Publish from a new orphan public baseline or rewrite history before making the repository public.");
  process.exit(1);
}

console.log("Git history scan passed.");
