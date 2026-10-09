import { Hono } from "hono";
import { getRuleSource } from "../lib/rule-sources";
import { loadMirroredRule, RemoteAssetUnavailableError } from "../lib/remote-assets";

export const ruleRoutes = new Hono<{ Bindings: SubStoreEnv }>();

ruleRoutes.get("/rules/:name", async (c) => {
  const rawName = c.req.param("name");
  const name = rawName.endsWith(".list") ? rawName.slice(0, -5) : "";
  if (!name || !getRuleSource(name)) return c.text("Not Found", 404);

  try {
    const forceRefresh = ["1", "true"].includes(c.req.query("refresh") || "");
    const result = await loadMirroredRule(c.env, name, forceRefresh);
    return new Response(result.content, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "public, max-age=300, stale-if-error=86400",
        etag: `\"sha256-${result.sha256}\"`,
        "x-asset-cache": result.status,
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    const status = error instanceof RemoteAssetUnavailableError ? 503 : 500;
    return c.text(status === 503 ? "Rule is temporarily unavailable" : "Internal server error", status);
  }
});
