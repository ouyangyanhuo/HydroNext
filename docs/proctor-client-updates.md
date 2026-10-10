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
| `minClientVersion` | 客户端执行限制并缓存；低于最低版本时拒绝生成提交证明；OJ 握手仍执行精确指定版本 |
| `releaseDate` / `description` / `changelog` | 元数据；本次更新提示不完整展示更新说明 |
| `hotUpdate.asarUrl` | 当前 OJ 无独立发布签名，客户端拒绝自动执行/替换 ASAR |
| `hotUpdate.fallbackUrl` | 包下载模块主地址失败后真实尝试备用地址 |
| `hotUpdate.size` / `sha256` | 下载模块验证字节数和 SHA-256 后才保存，不能代替独立发布签名 |
| `config.url` | 下载有大小限制的 JSON；以编译白名单验证后缓存，下次启动读取 |
| `config.fallbackUrl` | 主地址失败后尝试；远端配置不能修改编译公钥/扩大 origin 或开启 root 调试 |
| `config.version` | 当前不按配置版本排序，使用已发布清单中的配置 |
| `fullUpdate.*` | Windows x64 显示完整包下载地址；Mac 不显示 Windows EXE |

发布最低版本与 **监考设置中的指定客户端版本**是两件独立的事。本功能不会自动修改指定版本，避免突然使进行中的比赛会话失效。

## 客户端构建与接入

客户端代码已修改，构建时通过 `PROCTOR_VERSION_URL` 注入清单地址，通过 `PROCTOR_UPDATE_ORIGINS` 注入更新站点白名单（JSON 数组）。也可提前编辑 `config/exam-config.json` 的 `updater.versionUrl`、`fallbackVersionUrl` 和 `allowedOrigins`。应使用自建 OJ 地址，避免意外回退到其他项目的发行版本。完整参数见 [客户端 README](../exam-proctor-client/README.md)。

考试访问 origin 与更新 origin 分别配置。清单、包、备用地址以及重定向后的 origin 都必须在更新白名单；仅 HTTPS，localhost 可用 HTTP。重定向受限制并支持安全的相对地址。远端配置只能在构建信任边界内改变策略，不能轮换公钥、扩大地址白名单或启用 root 调试。

存在未完成或待补传日志时跳过更新检查，避免考试版本或环境突然改变。最低版本在成功读取清单后缓存；离线沿用已缓存限制，无法获取新清单时仍由 OJ 精确版本和签名提交验证控制。发布最低版本不会修改 OJ 指定版本。

## ASAR 与更新安全

`release:hot` 现已使用明确临时 staging 目录，根目录包含 package.json、正确的 app/main/index.js 和编译信任配置，版本取 `PROCTOR_CLIENT_VERSION`。不再只把 app/ 内容当成整个 Electron app.asar，也不打包根目录私钥、.env 或旧构建包。它输出独立版本文件及大小/SHA-256 元数据，供 OJ 包库接收和管理员检查。

下载模块流式检查大小/哈希，实际回退备用地址，限制重定向和 JSON/包上限。但现有 OJ 没有独立发布签名字段，HTTPS 和清单内哈希不能证明包发布者；因此客户端**不会自动执行或替换 ASAR**，也不以“开发模式模拟更新”宣称安装成功。未来自动 ASAR 协议需双方实现独立更新签名、原子替换、外部回滚和启动验证。可选的独立签名校验辅助函数不表示 OJ 已支持该协议。

完整包更新由客户端显示下载提示，管理员提供签名的安装包。Mac 需签名、公证并分发完整包，直接替换签名 bundle 中的 ASAR 会破坏签名；完整包还能同时升级 Electron。

## Windows 与 Mac 发布

GitHub Actions 已配置 Windows x64、macOS x64、macOS arm64 三种发行 Artifact，并支持动态版本、公钥和地址。证书与公证 Secrets 见客户端 README。工作流不自动发布到 OJ；管理员仍需上传和发布经过平台验收的包。

**当前 OJ 更新后台只接受 Windows 安装/便携包和单一链接，不支持 Mac 包类型或平台/架构映射。** 本次没有扩展后台上传管理。客户端会读取将来的 `fullUpdate.platforms.<win32|darwin>.<x64|arm64>` 对应安装地址，但现有后台不会生成该字段；Mac 目前使用人工分发。不要把 Mac 包上传为 Windows installerUrl，或在一个旧格式清单中混用不同平台文件。

## 验证建议

测试未授权用户拒绝访问管理 API，草稿包 404、发布包无需登录可下载，清单为纯 JSON 而不是 HTML/UI context，域内进入管理页仍生成主源站全局链接，多管理员同时保存出现版本冲突提示，发布同版本不同 ASAR 被拒绝，缺失文件/损坏 ASAR 被拒绝，分页与模糊搜索可找到旧包。

生产部署要保证 MongoDB 和 Hydro 文件存储持久化，反向代理允许上述两个公开 GET 路由和足够大的管理员 POST 上传。无需升级 MongoDB 或改变 Docker 镜像名称。
