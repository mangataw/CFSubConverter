# 最小安全审计记录

## 审计基线

- 上游：`realchendahuang/sub-store-cloudflare`
- 固定提交：`6c4f4616308826a4bf4b72d091dfc0c5cc6408f0`
- 上游版本：`1.1.0`
- 许可证：AGPL-3.0-or-later

## 已检查路径

- 下载鉴权：`cloudflare/src/routes/download.ts`
- Secret 比较及安全响应头：`cloudflare/src/lib/http.ts`
- 上游订阅请求、缓存、解析、去重和输出：`cloudflare/src/lib/subscription.ts`
- D1 源、组合、模板和设置：`cloudflare/src/lib/store.ts`
- 下载授权与撤销：`cloudflare/src/lib/compatibility-resources.ts`
- Wrangler Secrets、D1 与静态资产绑定：根目录及 `cloudflare/wrangler.jsonc`
- 数据迁移：`cloudflare/migrations/`
- 安装器隐私路径和 Git ignore：`AGENTS.md`、`scripts/install-cloudflare.mjs`、`.gitignore`

## 上游已具备的安全特性

- 管理端与下载端使用不同 Secrets。
- 令牌经 SHA-256 后使用 `crypto.subtle.timingSafeEqual` 比较。
- 管理 API 必须鉴权；下载支持总令牌和可撤销的范围令牌。
- 上游响应有单文件及总大小限制。
- Cache API 键由 URL 与 UA 的哈希生成，不把机场 URL放进缓存键路径。
- 错误处理不会把完整异常对象直接返回给未授权请求。
- 私有配置、seed SQL、部署配置和 `.dev.vars` 已进入 `.gitignore`。

## 本实现新增的防护

- 模板主机白名单及 HTTPS 限制。
- 模板和规则禁止重定向；机场订阅最多允许两次 HTTP(S) 重定向。
- 规则路由使用静态精确映射，未知规则 404。
- 模板禁止自带节点，并验证策略组、规则 provider、behavior、format 和策略引用。
- 新版模板/规则只有验证成功后才覆盖 KV 最后成功副本。
- D1 只记录公开上游 URL、哈希、时间和脱敏错误类型；结构化日志不记录秘密。
- 临时订阅 URL 查询参数覆盖默认关闭。
- 所有外部正文都有上限和超时。

## 保留风险与处理

- 机场 URL 作为 Sub-Store 功能数据保存在 D1；它不进入公开源码，但 Cloudflare 账号管理员可访问。
- 下载令牌必须出现在客户端订阅 URL 中，客户端、本机历史或 Cloudflare 请求日志可能看到它；泄露时立即轮换。
- KV 是最终一致存储，全球边缘短时间可能读到旧但仍有效的最后成功版本。
- 第三方规则仓库仍是供应链依赖；本实现防止无效内容覆盖，但不能证明规则语义一定可信。
- Workers Free CPU 是否足够取决于真实节点数量，必须上线后实测。
- 未获得真实机场订阅和客户端环境前，无法完成端到端兼容性证明。

## 依赖审计结果

上游锁文件最初命中 18 个高危公告。已在原有主要版本范围内更新依赖，
并对 `source-map-js` 使用 `>=1.2.2` 的工作区覆盖。最终执行
`pnpm audit --prod --audit-level=high` 返回 `No known vulnerabilities found`。
