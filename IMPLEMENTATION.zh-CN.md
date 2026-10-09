# Cloudflare + Clash/Mihomo 动态订阅实现

本项目基于 `realchendahuang/sub-store-cloudflare` 固定提交
`6c4f4616308826a4bf4b72d091dfc0c5cc6408f0` 扩展，保留原项目
AGPL-3.0-or-later 许可证。

## 已实现

- Workers 请求时拉取 D1 中的机场订阅，解析并把节点直接写入最终 `proxies`。
- `github-mihomo` 模板从 `mangataw/LadderTools/configs/mihomo.yaml` 动态读取。
- 模板使用 ETag / Last-Modified 条件请求；`refresh=1` 强制重新检查模板和机场订阅。
- 模板通过 YAML 结构、策略组、规则引用和规则 URL 白名单校验后才进入 KV。
- `/rules/<name>.list` 只允许编译进代码的规则映射，不接受任意 URL。
- 规则检查大小与内容，成功版本写入 KV；上游失败或损坏时返回最后成功副本。
- D1 `remote_assets` 记录 ETag、哈希、检查时间、成功时间和脱敏错误类型。
- 机场上游响应有大小、超时和最多两次重定向限制。
- 下载路由的临时 `url=` / `content=` 覆盖默认关闭，避免把机场 URL 放进普通查询参数。
- 管理令牌和下载令牌继续使用两个独立 Worker Secrets，并使用定长哈希安全比较。
- Workers Logs 和 Traces 已启用；日志不包含订阅 URL、节点、下载 URL或令牌。
- Wrangler 部署会自动创建 KV；不使用 R2、Containers 或付费 Worker 功能。

## 数据流

```text
LadderTools/mihomo.yaml ─┐
LadderTools/第三方规则 ──┼─> Worker 条件拉取 ─> 校验 ─> KV 最后成功副本
D1 私有机场 URL ────────┘              │
                                      └─> 动态节点 + 模板 ─> Mihomo YAML
```

短期缓存默认 300 秒。主配置的 `refresh=1` 只强制刷新机场订阅和 YAML 模板，
不会同步拉取三十多个规则；每个规则由 Mihomo 独立访问 `/rules/*.list` 更新。

## 关键配置参数

部署参数位于被 Git 忽略的 `config/agent-setup.local.json`：

| 参数 | 用途 | 默认值 |
| --- | --- | --- |
| `deployment.workerName` | Worker 名称 | `sub-store-cloudflare` |
| `deployment.d1DatabaseName` | D1 名称 | `sub-store-cloudflare` |
| `deployment.kvNamespaceId` | 复用既有 KV；留空则自动创建 | 留空 |
| `deployment.remoteTemplateUrl` | GitHub 原始 YAML 地址 | LadderTools `configs/mihomo.yaml` |
| `deployment.remoteTemplateAllowedHosts` | 模板允许主机白名单 | `raw.githubusercontent.com` |
| `deployment.remoteAssetCacheSeconds` | 模板/规则检查间隔 | `300` |
| `deployment.adminHostname` | 可选管理域名 | 留空，使用 `workers.dev` |
| `deployment.downloadHostname` | 可选独立下载域名 | 留空 |
| `deployment.adminToken` | 管理 Secret | 留空则安装器安全生成 |
| `deployment.downloadToken` | 下载 Secret | 留空则安装器安全生成 |

机场 URL 只填入本地配置的 `sources[].url`。不要写入公开仓库、聊天记录或命令行参数。

## 输出地址

安装器部署并验证后会打印真实地址。格式如下：

```text
管理界面：https://<worker>.<subdomain>.workers.dev/?token=<admin-token>
Mihomo：https://<worker>.<subdomain>.workers.dev/download/collection/main/mihomo/<download-token>
Stash：https://<worker>.<subdomain>.workers.dev/download/collection/main/stash/<download-token>
强制刷新：在订阅地址末尾添加 ?refresh=1
```

建议优先使用路径令牌形式，不把真实地址复制到公开问题、日志或仓库。

## 故障语义

- GitHub 正常且内容有效：更新 KV 与 D1 元数据并返回新版。
- GitHub 返回 304：返回 KV 副本，不重复写 KV。
- GitHub 超时、5xx、重定向或内容损坏：返回 KV 最后成功副本。
- 首次部署尚无成功副本且 GitHub 不可用：返回 503，不生成残缺配置。
- 未知 `/rules/*` 名称：返回 404，不做代理转发。

## 验收重点

生产部署后必须观察 Worker 日志中的 CPU time。模板与规则不在主请求中批量同步，
但机场节点数量未知，仍需确认免费套餐 CPU 限制下没有 Error 1102。
OpenClash/Mihomo 与 Stash 应分别导入验证；本地自动化测试不能替代真实客户端兼容性测试。
