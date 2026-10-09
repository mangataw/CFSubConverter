export type RuleBehavior = "classical" | "domain" | "ipcidr";

export type RuleSource = {
  url: string;
  behavior: RuleBehavior;
};

// This is intentionally an exact allowlist. Never accept an arbitrary upstream URL
// from a request: /rules/:name is a mirror, not an open proxy.
export const RULE_SOURCES = {
  custom_direct: { url: "https://raw.githubusercontent.com/mangataw/LadderTools/main/rules/proxy_direct.list", behavior: "classical" },
  custom_ai: { url: "https://raw.githubusercontent.com/mangataw/LadderTools/main/rules/proxy_ai.list", behavior: "classical" },
  custom_us: { url: "https://raw.githubusercontent.com/mangataw/LadderTools/main/rules/proxy_us.list", behavior: "classical" },
  custom_japan: { url: "https://raw.githubusercontent.com/mangataw/LadderTools/main/rules/proxy_japan.list", behavior: "classical" },
  custom_japan_not: { url: "https://raw.githubusercontent.com/mangataw/LadderTools/main/rules/proxy_japan_not.list", behavior: "classical" },
  custom_proxy: { url: "https://raw.githubusercontent.com/mangataw/LadderTools/main/rules/proxy.list", behavior: "classical" },
  ai_common: { url: "https://raw.githubusercontent.com/iab0x00/ProxyRules/main/Rule/AI.txt", behavior: "classical" },
  google: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Google/Google.list", behavior: "classical" },
  google_fcm: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GoogleFCM/GoogleFCM.list", behavior: "classical" },
  telegram: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Telegram/Telegram.list", behavior: "classical" },
  telegram_cidr: { url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/telegramcidr.txt", behavior: "ipcidr" },
  game: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Game/Game.list", behavior: "classical" },
  github: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GitHub/GitHub.list", behavior: "classical" },
  onedrive: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/OneDrive/OneDrive.list", behavior: "classical" },
  microsoft: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Microsoft/Microsoft.list", behavior: "classical" },
  apple: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Apple/Apple.list", behavior: "classical" },
  youtube: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/YouTube/YouTube.list", behavior: "classical" },
  netflix: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Netflix/Netflix.list", behavior: "classical" },
  bahamut: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Bahamut/Bahamut.list", behavior: "classical" },
  global_media: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/GlobalMedia/GlobalMedia.list", behavior: "classical" },
  ads_awavenue: { url: "https://raw.githubusercontent.com/TG-Twilight/AWAvenue-Ads-Rule/main/Filters/AWAvenue-Ads-Rule-Surge-RULE-SET-Only.Ads.list", behavior: "classical" },
  ads_acl4ssr: { url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanAD.list", behavior: "classical" },
  program_ads: { url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/BanProgramAD.list", behavior: "classical" },
  lan: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/Lan/Lan.list", behavior: "classical" },
  netease_music: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/NetEaseMusic/NetEaseMusic.list", behavior: "classical" },
  bilibili: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/BiliBili/BiliBili.list", behavior: "classical" },
  china_media: { url: "https://raw.githubusercontent.com/blackmatrix7/ios_rule_script/master/rule/Clash/ChinaMedia/ChinaMedia.list", behavior: "classical" },
  china_domain: { url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaDomain.list", behavior: "classical" },
  china_company_ip: { url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ChinaCompanyIp.list", behavior: "classical" },
  download: { url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/Download.list", behavior: "classical" },
  private_domain: { url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/private.txt", behavior: "domain" },
  applications: { url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/applications.txt", behavior: "classical" },
  cn_cidr: { url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/cncidr.txt", behavior: "ipcidr" },
  proxy_domain: { url: "https://raw.githubusercontent.com/Loyalsoldier/clash-rules/release/proxy.txt", behavior: "domain" },
  proxy_gfw: { url: "https://raw.githubusercontent.com/ACL4SSR/ACL4SSR/master/Clash/ProxyGFWlist.list", behavior: "classical" },
} as const satisfies Record<string, RuleSource>;

export type RuleSourceName = keyof typeof RULE_SOURCES;

export function getRuleSource(name: string): RuleSource | undefined {
  return Object.prototype.hasOwnProperty.call(RULE_SOURCES, name)
    ? RULE_SOURCES[name as RuleSourceName]
    : undefined;
}
