import { parse as parseYaml } from "yaml";
import { readResponseText } from "./read";
import { getRuleSource, RULE_SOURCES } from "./rule-sources";
import type { RoutingTemplate, RoutingTemplateConfig } from "../types";

const TEMPLATE_MAX_BYTES = 512 * 1024;
const RULE_MAX_BYTES = 2 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 8_000;
const DEFAULT_CACHE_SECONDS = 300;
const DEFAULT_TEMPLATE_ID = "github-mihomo";

type AssetStatus = "hit" | "updated" | "revalidated" | "stale";

type AssetMetadata = {
  id: string;
  source_url: string;
  etag: string | null;
  last_modified: string | null;
  content_sha256: string | null;
  last_checked_at: number | null;
  last_success_at: number | null;
  last_error: string | null;
};

type LoadedAsset<T> = {
  value: T;
  content: string;
  status: AssetStatus;
  sha256: string;
};

type AssetDefinition<T> = {
  id: string;
  url: string;
  maxBytes: number;
  forceRefresh: boolean;
  parse: (content: string) => T;
};

export class RemoteAssetUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RemoteAssetUnavailableError";
  }
}

export async function loadRemoteRoutingTemplate(
  env: SubStoreEnv,
  requestOrigin: string,
  forceRefresh = false,
): Promise<{ template: RoutingTemplate; status: AssetStatus }> {
  const templateUrl = String(env.REMOTE_TEMPLATE_URL || "").trim();
  if (!templateUrl) throw new RemoteAssetUnavailableError("REMOTE_TEMPLATE_URL is not configured");
  assertAllowedTemplateUrl(templateUrl, env.REMOTE_TEMPLATE_ALLOWED_HOSTS);

  const id = String(env.REMOTE_TEMPLATE_ID || DEFAULT_TEMPLATE_ID).trim() || DEFAULT_TEMPLATE_ID;
  const result = await loadRemoteAsset(env, {
    id: `template:${id}`,
    url: templateUrl,
    maxBytes: TEMPLATE_MAX_BYTES,
    forceRefresh,
    parse: (content) => parseAndValidateTemplate(content, requestOrigin),
  });

  return {
    template: {
      id,
      name: "GitHub Mihomo Template",
      target: "mihomo",
      config: result.value,
    },
    status: result.status,
  };
}

export async function loadMirroredRule(
  env: SubStoreEnv,
  name: string,
  forceRefresh = false,
): Promise<LoadedAsset<string>> {
  const source = getRuleSource(name);
  if (!source) throw new RemoteAssetUnavailableError("Rule is not allowlisted");
  return loadRemoteAsset(env, {
    id: `rule:${name}`,
    url: source.url,
    maxBytes: RULE_MAX_BYTES,
    forceRefresh,
    parse: validateRuleContent,
  });
}

async function loadRemoteAsset<T>(env: SubStoreEnv, definition: AssetDefinition<T>): Promise<LoadedAsset<T>> {
  const kvKey = `last-good:${definition.id}`;
  const [cachedContent, metadata] = await Promise.all([
    env.ASSET_SNAPSHOTS.get(kvKey),
    readAssetMetadata(env, definition.id),
  ]);
  const cacheSeconds = boundedNumber(env.REMOTE_ASSET_CACHE_SECONDS, DEFAULT_CACHE_SECONDS, 0, 3600);
  const now = Date.now();

  if (
    cachedContent
    && !definition.forceRefresh
    && metadata?.last_checked_at
    && now - metadata.last_checked_at < cacheSeconds * 1000
  ) {
    return {
      value: definition.parse(cachedContent),
      content: cachedContent,
      status: "hit",
      sha256: metadata.content_sha256 || await sha256(cachedContent),
    };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const headers = new Headers({
      accept: "text/plain, text/yaml, application/yaml;q=0.9, */*;q=0.1",
      "user-agent": "cloudflare-clash-subscription/1.0",
    });
    if (cachedContent && metadata?.etag) headers.set("if-none-match", metadata.etag);
    if (cachedContent && metadata?.last_modified) headers.set("if-modified-since", metadata.last_modified);

    const response = await fetch(definition.url, {
      headers,
      redirect: "error",
      signal: controller.signal,
    });

    if (response.status === 304 && cachedContent) {
      const value = definition.parse(cachedContent);
      await writeAssetMetadata(env, {
        id: definition.id,
        source_url: definition.url,
        etag: metadata?.etag || null,
        last_modified: metadata?.last_modified || null,
        content_sha256: metadata?.content_sha256 || await sha256(cachedContent),
        last_checked_at: now,
        last_success_at: metadata?.last_success_at || now,
        last_error: null,
      });
      logAsset(definition.id, "revalidated");
      return {
        value,
        content: cachedContent,
        status: "revalidated",
        sha256: metadata?.content_sha256 || await sha256(cachedContent),
      };
    }

    if (!response.ok) throw new Error(`upstream_status_${response.status}`);
    const content = await readResponseText(response, definition.maxBytes, `Remote asset ${definition.id}`);
    const value = definition.parse(content);
    const contentSha256 = await sha256(content);

    await env.ASSET_SNAPSHOTS.put(kvKey, content);
    await writeAssetMetadata(env, {
      id: definition.id,
      source_url: definition.url,
      etag: cleanHeader(response.headers.get("etag")),
      last_modified: cleanHeader(response.headers.get("last-modified")),
      content_sha256: contentSha256,
      last_checked_at: now,
      last_success_at: now,
      last_error: null,
    });
    logAsset(definition.id, "updated");
    return { value, content, status: "updated", sha256: contentSha256 };
  } catch (error) {
    const errorType = safeErrorType(error);
    await safeRecordFailure(env, definition, metadata, errorType, now);
    if (cachedContent) {
      logAsset(definition.id, "stale", errorType);
      return {
        value: definition.parse(cachedContent),
        content: cachedContent,
        status: "stale",
        sha256: metadata?.content_sha256 || await sha256(cachedContent),
      };
    }
    logAsset(definition.id, "unavailable", errorType);
    throw new RemoteAssetUnavailableError(`No valid cached copy exists for ${definition.id}`);
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseAndValidateTemplate(content: string, requestOrigin: string): RoutingTemplateConfig {
  const expanded = content.replaceAll("${WORKER_ORIGIN}", requestOrigin);
  const parsed = parseYaml(expanded) as unknown;
  if (!isRecord(parsed)) throw new Error("template_not_an_object");
  if (Array.isArray(parsed.proxies) && parsed.proxies.length > 0) throw new Error("template_must_not_contain_nodes");

  const groups = parsed["proxy-groups"] ?? parsed.proxyGroups;
  const providers = parsed["rule-providers"] ?? parsed.ruleProviders;
  const rules = parsed.rules;
  if (!Array.isArray(groups) || groups.length === 0) throw new Error("template_missing_proxy_groups");
  if (!isRecord(providers) || Object.keys(providers).length === 0) throw new Error("template_missing_rule_providers");
  if (!Array.isArray(rules) || rules.length === 0 || !rules.every((rule) => typeof rule === "string")) {
    throw new Error("template_missing_rules");
  }

  const groupNames = new Set<string>();
  for (const group of groups) {
    if (!isRecord(group) || typeof group.name !== "string" || typeof group.type !== "string") {
      throw new Error("template_invalid_proxy_group");
    }
    if (groupNames.has(group.name)) throw new Error("template_duplicate_proxy_group");
    groupNames.add(group.name);
  }

  const allowedGroupReferences = new Set(["DIRECT", "REJECT", "$all", ...groupNames]);
  for (const group of groups) {
    if (!isRecord(group) || group.proxies === undefined) continue;
    if (!Array.isArray(group.proxies) || !group.proxies.every((entry) => typeof entry === "string" && allowedGroupReferences.has(entry))) {
      throw new Error("template_proxy_group_references_unknown_group");
    }
  }

  for (const [providerName, provider] of Object.entries(providers)) {
    if (!isRecord(provider) || typeof provider.url !== "string") throw new Error("template_invalid_rule_provider");
    const providerUrl = new URL(provider.url);
    const expectedOrigin = new URL(requestOrigin).origin;
    const match = providerUrl.pathname.match(/^\/rules\/([a-z0-9_]+)\.list$/);
    const ruleSource = match ? getRuleSource(match[1]) : undefined;
    if (providerUrl.origin !== expectedOrigin || !match || !ruleSource) {
      throw new Error(`template_rule_provider_not_allowlisted:${providerName}`);
    }
    if (provider.behavior !== ruleSource.behavior || provider.format !== "text") {
      throw new Error(`template_rule_provider_type_mismatch:${providerName}`);
    }
  }

  const allowedPolicies = new Set(["DIRECT", "REJECT", ...groupNames]);
  for (const rule of rules as string[]) {
    const fields = rule.split(",").map((field) => field.trim());
    const policy = fields[0] === "MATCH" || fields[0] === "FINAL" ? fields[1] : fields[2];
    if (!policy || !allowedPolicies.has(policy)) throw new Error("template_rule_references_unknown_policy");
    if (fields[0] === "RULE-SET" && !Object.prototype.hasOwnProperty.call(providers, fields[1])) {
      throw new Error("template_rule_references_unknown_provider");
    }
  }

  return parsed as RoutingTemplateConfig;
}

function validateRuleContent(content: string) {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("rule_is_empty");
  if (/^\s*<!doctype html|<html[\s>]/i.test(trimmed)) throw new Error("rule_is_html");
  const usefulLines = trimmed
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith(";"));
  if (usefulLines.length === 0) throw new Error("rule_has_no_entries");
  return content;
}

function assertAllowedTemplateUrl(rawUrl: string, allowedHostsValue: string | undefined) {
  const url = new URL(rawUrl);
  const allowedHosts = String(allowedHostsValue || "raw.githubusercontent.com")
    .split(",")
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || url.port
    || url.hash
    || !allowedHosts.includes(url.hostname.toLowerCase())
  ) {
    throw new RemoteAssetUnavailableError("REMOTE_TEMPLATE_URL is outside the allowed HTTPS hosts");
  }
}

async function readAssetMetadata(env: SubStoreEnv, id: string) {
  return env.DB.prepare("SELECT * FROM remote_assets WHERE id = ?").bind(id).first<AssetMetadata>();
}

async function writeAssetMetadata(env: SubStoreEnv, metadata: AssetMetadata) {
  await env.DB.prepare(
    `INSERT INTO remote_assets
      (id, source_url, etag, last_modified, content_sha256, last_checked_at, last_success_at, last_error)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source_url = excluded.source_url,
       etag = excluded.etag,
       last_modified = excluded.last_modified,
       content_sha256 = excluded.content_sha256,
       last_checked_at = excluded.last_checked_at,
       last_success_at = excluded.last_success_at,
       last_error = excluded.last_error`,
  ).bind(
    metadata.id,
    metadata.source_url,
    metadata.etag,
    metadata.last_modified,
    metadata.content_sha256,
    metadata.last_checked_at,
    metadata.last_success_at,
    metadata.last_error,
  ).run();
}

async function safeRecordFailure(
  env: SubStoreEnv,
  definition: AssetDefinition<unknown>,
  metadata: AssetMetadata | null,
  errorType: string,
  now: number,
) {
  try {
    await writeAssetMetadata(env, {
      id: definition.id,
      source_url: definition.url,
      etag: metadata?.etag || null,
      last_modified: metadata?.last_modified || null,
      content_sha256: metadata?.content_sha256 || null,
      last_checked_at: now,
      last_success_at: metadata?.last_success_at || null,
      last_error: errorType,
    });
  } catch {
    // The original fetch/validation error remains the useful failure. Do not
    // replace it with a secondary metadata-write error.
  }
}

function cleanHeader(value: string | null) {
  return value && !/[\r\n]/.test(value) ? value.slice(0, 512) : null;
}

function safeErrorType(error: unknown) {
  if (error instanceof DOMException && error.name === "AbortError") return "timeout";
  if (error instanceof Error) return error.message.replace(/https?:\/\/\S+/g, "[url]").slice(0, 160);
  return "unknown_error";
}

function boundedNumber(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(min, parsed)) : fallback;
}

async function sha256(content: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function logAsset(assetId: string, status: string, errorType?: string) {
  const payload = { event: "remote_asset", assetId, status, ...(errorType ? { errorType } : {}) };
  if (status === "unavailable") console.error(JSON.stringify(payload));
  else console.log(JSON.stringify(payload));
}

export function listRuleSourceNames() {
  return Object.keys(RULE_SOURCES);
}
