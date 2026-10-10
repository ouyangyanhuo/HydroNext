# exam-proctor-client 接入实现

客户端已按 [proctor-protocol.md](./proctor-protocol.md) 接入。完整构建变量、GitHub Actions、平台保护边界和发行步骤见 [客户端 README](../exam-proctor-client/README.md)。客户端是独立 Git 仓库，Hydro 父仓库忽略其目录；修改需要分别保存到两个仓库。

## 模块与行为

| 模块 | 已实现行为 |
| --- | --- |
| `proctor-crypto.js` | 严格规范化 JSON、Ed25519 验签/签名、SHA-256、构建公钥类型验证 |
| `device-store.js` | 每台安装独立设备密钥及稳定指纹；safeStorage 保存设备私钥和 journal AES 密钥，无明文回退 |
| `proctor-auth.js` | Electron 登录 Cookie、签名身份、双向握手、会话验签、单飞刷新、每次操作独立 nonce/proof |
| `proctor-controller.js` | 比赛/题目上下文、受限提交桥、结束事务、原账号补传、回执哈希确认、重启恢复 |
| `audit-logger.js` | 实时逐条 AES-GCM journal、序号/摘要链、异常尾部恢复、固定最终 RSA/AES `.hplog` |
| `preload.js` | 只暴露状态、提交证明和结束监考；sender/main frame/origin、路径、数字 PID、类型/大小由主进程验证 |
| `index.js` | 单实例、持久登录会话、root 调试、在途提交跟踪、正常退出及 Windows 网络恢复 |
| `prepare-build.js` / `before-pack.js` | 两组公钥、keyId、origin 白名单强制校验，构建生成配置不进 Git |
| `build.js` / Actions | Windows x64 NSIS/便携包、Mac x64/arm64 DMG/ZIP，动态版本/公钥/地址注入 |

公钥来自 OJ 同一次生成的认证与日志密钥；服务端私钥不能传入构建。公钥仍可从安装包提取。协议证明设备持有私钥并绑定请求，不能证明开源客户端二进制绝对未被修改。

## root 调试的服务端补充

新增 `POST /proctor/identity`，域内使用 `/d/<domainId>/proctor/identity`，详见协议文档。服务端对新鲜 nonce、当前 UID、系统 root 权限和比赛题目归属签名，客户端以构建认证公钥验证。

只有 `debug.allowRoot=true` 且已验证 PRIV_ALL 超级管理员权限时自动解除网络限制、停止快捷键/进程扫描、退出 kiosk 并允许 DevTools。普通用户名叫 root 的账号无效；账号切换或身份验证失败取消调试。调试不绕过服务端监考提交验证。

普通考试中的网络异常、返回首页不会结束已有的监考日志；重启后登录原账号可恢复未结束的 attempt。身份请求失败不能授权新提交。服务器没有认证密钥或缺少身份接口时，客户端报告认证错误，不使用页面变量降级授权。

## 日志与结束事务

每条日志加密追加并 fsync；最终文件生成前核验全部序号和摘要链。进程异常重启记录 `ABNORMAL_EXIT_DETECTED` 和 `CLIENT_RESTART`，系统 OS boot 标识改变另记 `SYSTEM_RESTART`；损坏尾部保留并标记，中段损坏拒绝恢复。

结束时停止新证明、等待已有提交，调用服务端 finish、加密生成最终日志、上传并保存回执。断网不把用户无限锁在窗口或防火墙中：恢复网络、保留固定日志并提示成绩待确认，后续联网和登录原账号后自动按退避补传。响应丢失查询 status 的文件 SHA-256 确认；不会生成替代文件。版本/密钥永久错误暂停当前版本，更新后可重新尝试；管理员修复策略后也可点击客户端“补传日志”手动重试。

日志不写代码正文、令牌或私钥。成功上传后仍保留本机加密证据供异常恢复，需按管理员留存策略清理。设备密钥不能丢失，否则同一次考试的环境验证和本地解密无法恢复。

## 平台与更新边界

Windows 有保存/恢复原策略的防火墙及独立看守进程；Mac 本次实现应用内地址白名单和监控，没有系统级 Network Extension。普通 Electron 窗口/快捷键、管理员权限、IP 白名单都不是不可绕过的设备可信证明。客户端默认只记录黑名单进程，显式配置才终止。

更新不在未完成/待上传考试中执行。清单兼容 OJ 的现有字段，最低版本策略缓存并执行，备用地址真正回退，下载限制重定向 origin、大小及 SHA-256。现有 OJ 没有独立更新签名，客户端不会自动执行 ASAR；完整包更新提示及 Mac 手工分发见 [更新文档](./proctor-client-updates.md)。

## 验收

客户端 `npm test` 覆盖双向验签、并发刷新、提交内容/路径/版本/环境绑定、root 冒充拒绝、AES/RSA 加密、异常续写、首页恢复、断网补传、丢失回执、更新完整性及 ASAR 入口。服务端测试覆盖签名身份和权限/题目归属。

还需 Windows/macOS 真机测试：强杀/断电后防火墙恢复、系统重启续写、不同账号补传拒绝、多屏/失焦事件、DPAPI/Keychain 权限、安装包签名与 Mac 公证、实际 OJ 登录/代码及文件提交。没有用 Linux 单元测试代替这些平台验收。
