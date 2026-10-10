# 监考客户端更新管理

## OJ 管理端

入口：系统管理 → **更新设置**（`/manage/client-updates`）。原来的用户导入仍位于用户管理中。

仅拥有 `PRIV_EDIT_SYSTEM` 的系统管理员可以管理更新；上传、保存、发布需要近期二次授权。域管理员不能发布客户端软件。

1. 填写 OJ 的完整公开源站地址，例如 `https://oj.example.com`。生产地址必须是 HTTPS，不带 `/d/域ID`、路径、查询参数或账号密码。localhost 开发时可用 HTTP。
2. 填写稳定数字版本，例如 `1.2.3`、最低版本、描述和逐行更新说明。
3. 选择包类型和包版本，点击选择文件或拖拽上传：ASAR 热更新包、Windows 安装包、Windows 便携包、客户端配置 JSON。
4. 上传后包仍为私有草稿。系统自动计算文件大小与 SHA-256；文件使用不可变 ID，不覆盖旧包。
5. 选择各类包，查看 JSON 预览。也可以从每页 25 项的包库中搜索文件名/版本并选择旧包。
6. 保存草稿不影响客户端。**发布更新**需要二次确认，服务端重新验证所有字段、文件及版本，流式读取存储中的实际文件并核对大小与 SHA-256，再原子更新公开清单与包访问资格。

清单 URL：`https://oj.example.com/client-updates/version.json`。

包 URL：`https://oj.example.com/client-updates/packages/<不可变ID>/<文件名>`。

更新包库每行提供 **删除** 按钮，需要系统管理权限、近期二次授权和确认。当前已发布清单使用的包（含备用地址引用）不能删除，需要先发布替代版本。历史包和未发布包可以删除；删除会清除相关草稿选项，原下载地址在 OJ 服务端返回 404，已在客户端下载的文件不受影响。历史清单的客户端若还在请求该旧包，需要重新获取当前清单。

已经被 CDN 或浏览器缓存的旧包不受服务端删除影响；如果需要撤销缓存，管理员还需在相应 CDN 上清理缓存。本功能不会操作外部 CDN。

删除与发布共享版本号并发检查，防止同时发布/删除同一个包。服务端先原子撤销下载资格并登记待清理任务，再调用 Hydro 文件删除机制；若存储暂不可用，页面提示待清理，服务端每分钟自动重试。文件的物理清理由 Hydro 原有存储回收策略处理，不直接改动 Docker 数据卷。

页面会显示清单及所有包的完整 URL、大小、SHA-256 和草稿/发布状态；支持查看已发布 JSON、预览草稿 JSON、下载 `version.json`。首次发布前清单为 404，草稿包的公开地址也为 404。未被管理员删除的历史已发布包保持可访问，防止客户端下载旧清单的包时遇到 404。

公开源站由管理员配置，URL 不随当前域、请求 Host 或反向代理内部 HTTP 改变。源站地址变更需要同时修改客户端配置与反向代理；本功能不替管理员迁移域名。包与清单均为全局功能。

包上限 240 MiB；配置 JSON 上限 256 KiB，并且必须包含有效的 `exam.targetUrl`。实际上传还受系统和反向代理的请求体大小限制。服务端流式计算哈希、流式提供下载，不在内存中加载完整可执行文件，也不解压或执行上传程序。

## JSON 格式和当前客户端实际支持范围

按照 `exam-proctor-client/app/main/updater.js` 的解析方式生成：

```json
{
  "version": "1.2.3",
  "minClientVersion": "1.0.0",
  "releaseDate": "2026-10-10T12:00:00.000Z",
  "description": "稳定版",
  "changelog": ["修复已知问题"],
  "hotUpdate": {
    "version": "1.2.3",
    "asarUrl": "https://oj.example.com/client-updates/packages/0123456789abcdef01234567/app.asar",
    "fallbackUrl": "",
    "size": 123456,
    "sha256": "由服务端计算的64位十六进制SHA256"
  },
  "config": {
    "version": "1.0.0",
    "url": "https://oj.example.com/client-updates/packages/0123456789abcdef01234568/exam-config.json",
    "fallbackUrl": ""
  },
  "fullUpdate": {
    "version": "1.2.3",
    "installerUrl": "https://oj.example.com/client-updates/packages/0123456789abcdef01234569/installer-1.2.3.exe",
    "portableUrl": "https://oj.example.com/client-updates/packages/0123456789abcdef0123456a/portable-1.2.3.exe"
  }
}
```

未选择的包对应字段不会出现；发布日期由服务端在发布时生成，而非管理员输入。配置包可以沿用之前的配置版本，ASAR 和 EXE 的包版本必须匹配发布版本。

| 字段 | 当前客户端行为 |
| --- | --- |
| `version` | 必填，数字分段比较；远端较新才热更新 |
| `minClientVersion` | 尚未执行限制，仅展示配置；不能用它保证旧客户端被禁止 |
| `releaseDate` / `description` / `changelog` | 元数据，当前更新器不显示这些内容 |
| `hotUpdate.asarUrl` | 下载并替换整个 `resources/app.asar` |
| `hotUpdate.fallbackUrl` | 仅在主 URL 为空时选用；主 URL 下载失败后不会尝试它 |
| `hotUpdate.size` / `sha256` | 由 OJ 生成，但当前客户端不校验 |
| `config.url` | 尝试下载 JSON，即使应用版本没更新；校验 `exam.targetUrl` 后写入用户配置目录 |
| `config.fallbackUrl` / `config.version` | 当前更新器未使用 |
| `fullUpdate.*` | 当前更新器未使用，作为人工下载安装地址 |

发布最低版本与 **监考设置中的指定客户端版本**是两件独立的事。本功能不会自动修改指定版本，避免突然使进行中的比赛会话失效。

## 客户端接入配置（不修改客户端代码）

在客户端构建所携带的 `config/exam-config.json` 内，将以下两个字段都改为自建 OJ 的清单 URL，避免 OJ 网络中断后意外回退到其他项目的发行版本：

```json
{
  "updater": {
    "enabled": true,
    "checkOnStartup": true,
    "timeoutMs": 4000,
    "versionUrl": "https://oj.example.com/client-updates/version.json",
    "fallbackVersionUrl": "https://oj.example.com/client-updates/version.json"
  }
}
```

如果提供远端配置 JSON，它也应包含上述更新地址，避免下一次启动重新使用旧地址。客户端在检查更新前已读取本地配置，因此远端同步的配置通常在下一次启动生效；请由客户端验证实际加载时机。

现有代码只支持单一 ASAR/Windows 包链接，不会按 OS/架构选择包。不要在这个清单中混合不兼容的平台发行文件。

## 需要在客户端修正的事项

本次仅修改 OJ，没有修改 `exam-proctor-client/`。

### 必须修正热更新打包范围

`scripts/build-hot-update.js` 当前使用 `asar.createPackage(appDir, ...)`，只打包 `app/` 的内容。更新器却替换整个 Electron `app.asar`，从而丢失根目录 `package.json` 和正确目录层级。

应从完整 Electron 应用输出或明确的临时 staging 目录生成 ASAR：根目录包含 `package.json`，保留 `app/main/index.js` 等路径，并包括应用运行所需的生产依赖。确保 `package.json.main` 指向存在的文件，`package.json.version` 为发布版本。切勿直接打包整个仓库，把私钥、开发环境文件、构建缓存或旧更新包打进去。

OJ 可接受缺少入口信息的 ASAR 为草稿，以便显示具体问题，但禁止发布。必须对正式 Electron 环境测试更新后启动、版本读取及依赖完整性，不能仅使用开发模式的模拟更新成功作为验收。

### 更新安全

当前客户端既不验证清单签名，也不验证 ASAR 的 SHA-256；**清单里存在哈希并不代表客户端已验证更新真实性**。HTTPS 与 OJ 管理员授权能保护发布渠道，但不能替代客户端校验。

客户端应在写入和执行前验证包大小、哈希及独立更新签名；签名公钥作为可信构建配置，私钥只在发布系统中。认证公钥/日志加密公钥不能当作同一个更新签名协议直接使用。本次不虚构一个客户端尚未实现的签名字段。

还应实现：主地址失败后真实回退、最低版本限制及离线策略、相对重定向安全处理、安装包更新流程、更新失败回滚与启动验证。当前客户端获取不到所有清单时会进入离线模式，不是强制禁止使用旧版本；需要由监考握手的版本检查保障禁止提交。

## 验证建议

测试未授权用户拒绝访问管理 API，草稿包 404、发布包无需登录可下载，清单为纯 JSON 而不是 HTML/UI context，域内进入管理页仍生成主源站全局链接，多管理员同时保存出现版本冲突提示，发布同版本不同 ASAR 被拒绝，缺失文件/损坏 ASAR 被拒绝，分页与模糊搜索可找到旧包。

生产部署要保证 MongoDB 和 Hydro 文件存储持久化，反向代理允许上述两个公开 GET 路由和足够大的管理员 POST 上传。无需升级 MongoDB 或改变 Docker 镜像名称。
