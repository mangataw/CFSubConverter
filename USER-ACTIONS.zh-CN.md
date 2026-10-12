# 需要你完成的操作

以下步骤必须使用你的 GitHub 与 Cloudflare 登录状态，因此不能由未获账号授权的本地任务代办。
`codex doctor` 与本项目无关；项目使用锁定在仓库里的 Wrangler，不要求全局安装 Codex CLI。

## 1. 确认公开模板可用

公开模板已经发布到 `mangataw/LadderTools`。修改本项目中的：

```text
laddertools/configs/mihomo-template.yaml
```

后，需要同步更新 `mangataw/LadderTools` 仓库中的：

```text
configs/mihomo-template.yaml
```

同步前检查文件中没有机场 URL、节点或令牌。推送后确认下面地址能直接打开：

```text
https://raw.githubusercontent.com/mangataw/LadderTools/main/configs/mihomo-template.yaml
```

## 2. 创建本地私有部署配置

在本项目根目录运行：

```powershell
Copy-Item .\config\agent-setup.example.json .\config\agent-setup.local.json
```

编辑 `config/agent-setup.local.json`：

1. 删除示例 `airport-a` 和 `home-node`。
2. 添加真实远程源，`url` 填机场订阅 URL。
3. 把 collection ID 设为 `main`，`templateId` 保持 `github-mihomo`。
4. `sourceIds: []` 表示包含全部已启用源。
5. 保留 `dedupe-by-endpoint` 与 `sort-by-name`；是否启用 `clean-provider-nodes` 由你决定。
6. 不要把本地配置加入 Git。它已经被 `.gitignore` 排除。

最小结构：

```json
{
  "$schema": "./agent-setup.schema.json",
  "deployment": {
    "workerName": "sub-store-cloudflare",
    "d1DatabaseName": "sub-store-cloudflare",
    "remoteTemplateId": "github-mihomo",
    "remoteTemplateUrl": "https://raw.githubusercontent.com/mangataw/LadderTools/main/configs/mihomo-template.yaml",
    "remoteTemplateAllowedHosts": "raw.githubusercontent.com",
    "remoteAssetCacheSeconds": "300",
    "adminHostname": "",
    "downloadHostname": "",
    "downloadTargets": ["mihomo", "stash"]
  },
  "sources": [
    {
      "id": "airport-main",
      "name": "Airport Main",
      "type": "remote",
      "url": "<在本机替换为真实机场订阅 URL>",
      "enabled": true,
      "filterPresetIds": ["clean-provider-nodes"]
    }
  ],
  "collections": [
    {
      "id": "main",
      "name": "Main",
      "sourceIds": [],
      "templateId": "github-mihomo",
      "ignoreFailed": false,
      "enabled": true,
      "filterPresetIds": ["dedupe-by-endpoint", "sort-by-name"]
    }
  ],
  "templates": []
}
```

不要把真实 URL 发回聊天。

## 3. 登录 Cloudflare 并部署

在本项目根目录运行：

```powershell
pnpm install --frozen-lockfile
pnpm --dir cloudflare exec wrangler login
pnpm run seed:validate
pnpm run install:cloudflare
```

浏览器会要求你授权 Cloudflare。安装器随后会：

- 创建或复用 D1。
- 通过 Wrangler 自动 provision `ASSET_SNAPSHOTS` KV。
- 本地生成两个不同的高强度令牌（如果配置中没填）。
- 写入 Worker Secrets。
- 迁移数据库、部署、导入私有源并做 HTTP 验证。

不要在部署前手工把 token 写进 `wrangler.jsonc`。

## 4. 真实客户端验收

1. 复制安装器打印的 Mihomo/OpenClash 地址并导入。
2. 确认最终 YAML 顶层存在 `proxies`，节点随机场变化更新。
3. 检查地区组、`非日节点` 和 `奈飞节点`。
4. 复制 Stash 地址单独导入并测试；不要以 Mihomo 成功替代 Stash 验证。
5. 修改 GitHub 模板后，用 `?refresh=1` 检查新版本。
6. 分别访问一个 `/rules/*.list`，确认响应头 `x-asset-cache` 为 `updated`、`hit`、`revalidated` 或 `stale`。
7. 模拟 GitHub 故障前，必须先让模板和规则各成功同步至少一次。
8. 在 Cloudflare Workers 日志查看 CPU time、Error 1102、错误率和请求量。

只有安装器 HTTP 验证与真实客户端验证都成功，才算线上部署完成。
