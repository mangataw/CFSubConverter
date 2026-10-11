import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const projectRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  plugins: [
    cloudflareTest(async () => ({
      main: "./src/index.ts",
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        kvNamespaces: ["ASSET_SNAPSHOTS"],
        bindings: {
          TEST_MIGRATIONS: await readD1Migrations(`${projectRoot}migrations`),
          SUB_STORE_ADMIN_TOKEN: "test-admin-token",
          SUB_STORE_PUBLIC_DOWNLOAD_TOKEN: "test-download-token",
          SUB_STORE_APP_NAME: "Sub-Store Cloudflare Test",
          SUB_STORE_PUBLIC_DOWNLOAD_HOSTS: "downloads.example.com",
          REMOTE_TEMPLATE_ID: "github-mihomo",
          REMOTE_TEMPLATE_URL: "https://raw.githubusercontent.com/mangataw/LadderTools/main/configs/mihomo-template.yaml",
          REMOTE_TEMPLATE_ALLOWED_HOSTS: "raw.githubusercontent.com",
          REMOTE_ASSET_CACHE_SECONDS: "300",
          TEST_REMOTE_TEMPLATE: readFileSync(new URL("../laddertools/configs/mihomo-template.yaml", import.meta.url), "utf8"),
        },
      },
    })),
  ],
  test: {
    setupFiles: ["./test/setup.ts"],
    testTimeout: 15000,
  },
});
