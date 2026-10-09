import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:net";
import process from "node:process";

const port = await getAvailablePort();
const pnpmArgs = ["--dir", "cloudflare", "exec", "wrangler", "dev", "--local", "--ip", "127.0.0.1", "--port", String(port), "--config", "wrangler.jsonc"];
const pnpmCli = process.env.npm_execpath;
const child = spawn(
  pnpmCli ? process.execPath : "pnpm",
  pnpmCli ? [pnpmCli, ...pnpmArgs] : pnpmArgs,
  { cwd: process.cwd(), env: { ...process.env, CI: "1" }, stdio: ["ignore", "pipe", "pipe"] },
);

let output = "";
let spawnError;
child.stdout.on("data", (chunk) => { output = appendOutput(output, chunk); });
child.stderr.on("data", (chunk) => { output = appendOutput(output, chunk); });
child.on("error", (error) => { spawnError = error; });

try {
  const response = await waitForWorker(`http://127.0.0.1:${port}/sw.js`, child, () => spawnError);
  const body = await response.text();
  if (response.status !== 200 || !body.includes("registration.unregister")) {
    throw new Error(`Unexpected smoke response: ${response.status}`);
  }
  if (response.headers.get("x-content-type-options") !== "nosniff") {
    throw new Error("Security headers are missing from the smoke response");
  }
  console.log("Worker startup smoke test passed.");
} catch (error) {
  console.error(output.trim());
  throw error;
} finally {
  stopChild(child);
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 3000)),
  ]);
  if (child.exitCode === null) stopChild(child, true);
}

function stopChild(childProcess, force = false) {
  if (childProcess.exitCode !== null || !childProcess.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/pid", String(childProcess.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" });
    return;
  }
  childProcess.kill(force ? "SIGKILL" : "SIGTERM");
}

async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (!port) throw new Error("Unable to allocate a smoke-test port");
  return port;
}

async function waitForWorker(url, processHandle, getSpawnError) {
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (getSpawnError()) throw getSpawnError();
    if (processHandle.exitCode !== null) throw new Error(`Wrangler exited with code ${processHandle.exitCode}`);
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }
  throw new Error("Timed out waiting for Wrangler dev");
}

function appendOutput(previous, chunk) {
  return `${previous}${String(chunk)}`.slice(-12000);
}
