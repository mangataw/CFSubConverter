import { env } from "cloudflare:workers";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadMirroredRule,
  loadRemoteRoutingTemplate,
  RemoteAssetUnavailableError,
} from "../src/lib/remote-assets";

describe("persistent remote assets", () => {
  beforeEach(async () => {
    await env.ASSET_SNAPSHOTS.delete("last-good:template:github-mihomo");
    await env.ASSET_SNAPSHOTS.delete("last-good:rule:custom_proxy");
    await env.DB.prepare("DELETE FROM remote_assets").run();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores a validated GitHub template and serves the last good copy on failure", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(env.TEST_REMOTE_TEMPLATE, {
      status: 200,
      headers: { etag: "template-v1" },
    }));

    const fresh = await loadRemoteRoutingTemplate(env, "https://worker.example", true);
    expect(fresh.status).toBe("updated");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ redirect: "manual" });
    expect(fresh.template.config["proxy-groups"]).toBeTruthy();
    expect(await env.ASSET_SNAPSHOTS.get("last-good:template:github-mihomo")).toContain("custom_proxy");

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("network unavailable"));
    const stale = await loadRemoteRoutingTemplate(env, "https://worker.example", true);
    expect(stale.status).toBe("stale");
    expect(stale.template.config.rules).toContain("RULE-SET,custom_proxy,节点选择");
  });

  it("rejects a damaged template without replacing the last good copy", async () => {
    await env.ASSET_SNAPSHOTS.put("last-good:template:github-mihomo", env.TEST_REMOTE_TEMPLATE);
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("proxies:\n  - password: leaked", { status: 200 }));

    const stale = await loadRemoteRoutingTemplate(env, "https://worker.example", true);
    expect(stale.status).toBe("stale");
    expect(await env.ASSET_SNAPSHOTS.get("last-good:template:github-mihomo")).toBe(env.TEST_REMOTE_TEMPLATE);
  });

  it("mirrors only compiled rule names", async () => {
    await expect(loadMirroredRule(env, "https://attacker.example/rules", true)).rejects.toBeInstanceOf(
      RemoteAssetUnavailableError,
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response("DOMAIN-SUFFIX,example.com", { status: 200 }));
    const rule = await loadMirroredRule(env, "custom_proxy", true);
    expect(rule.status).toBe("updated");
    expect(rule.content).toContain("example.com");
  });
});
