# Hydro 监考客户端连接规范（hydro-proctor/1）

## 范围与安全边界

本文对应 OJ 服务端和 exam-proctor-client 的当前实现。构建、跨平台打包和调试配置见 [客户端 README](../exam-proctor-client/README.md)。

- 生产环境必须使用 HTTPS；反向代理必须正确传递并仅信任受控代理的协议/Host 信息。不得开放跨源 CORS。
- 比赛监考接口使用已登录的 Hydro 会话 Cookie，要求用户拥有当前域比赛查看权限且已报名；身份接口可返回访客上下文。
- 客户端主进程自动生成独立 Ed25519 设备密钥，用于握手和请求签名。无需管理员注册、注册码或人工登记名册；设备公钥随握手传入，并与本场考试的会话绑定。
- 服务端使用 Ed25519 签名私钥；对应公钥通过可信安装包预置在客户端。日志使用独立 RSA-3072/OAEP-SHA256 密钥，不与签名密钥混用。
- 令牌是 256 位随机不透明值，数据库只保存其 SHA-256；每个请求还要用客户端私钥签名，不能仅携带令牌。
- 这是设备密钥持有证明，不是官方客户端认证或硬件远程证明。自动接受设备公钥的接口无法仅凭自报版本判断安装包是否未经修改。构建变量能避免公钥出现在开源仓库，但公钥可以从安装包中提取，不能当作秘密；能复制设备私钥或修改客户端的攻击者仍可能伪造版本、指纹或日志内容。进一步保证需要操作系统代码签名、设备密钥保护、可信安装分发，必要时 TPM/远程证明。

设计参考 [RFC 9449 的密钥持有证明与重放防护](https://www.rfc-editor.org/rfc/rfc9449.html)；本协议不是 OAuth DPoP/JWT 的兼容实现。密码学原语使用 [Node.js Crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html)。

## 管理员配置与部署

1. 系统管理 → **监考设置**（`/manage/proctor`）→ **认证密钥**：点击一次“生成认证密钥”，同时生成 Ed25519 认证公私钥和独立 RSA-3072 日志加密/解密公私钥；两组密钥共用一个版本标识 keyId。
2. 管理员复制两组公钥和 keyId，通过下表变量注入客户端构建。客户端完成改造、构建并分发后，再设置精确客户端版本、令牌有效期、刷新策略、补传期限与文件大小，启用服务。
3. 比赛编辑页开启监考；比赛开始后不得改变开关。未启用监考的比赛保持原有流程。
4. 已登录且报名的用户启动客户端，客户端在主进程自动生成/保存设备私钥和环境指纹，自动 challenge/handshake、自动接受服务端令牌，不显示注册码输入。重启使用同一设备密钥续接原 attempt。

| 构建变量 | 来源 / 用途 |
| --- | --- |
| `PROCTOR_AUTH_PUBLIC_KEY` | 后台认证公钥 PEM：验签服务端挑战及令牌响应 |
| `PROCTOR_LOG_PUBLIC_KEY` | 同次生成的日志加密公钥 PEM：RSA-OAEP-SHA256 包装最终日志的 AES 密钥 |
| `PROCTOR_KEY_ID` | 同次生成的 keyId：校验密钥版本和日志头部 |

上述变量是客户端**需要新增支持**的构建接口，当前 `exam-proctor-client` 尚未读取它们。公钥 PEM 要完整保留换行；建议 CI 使用多行变量，构建脚本生成主进程的只读信任配置并校验密钥类型。变量缺失、密钥不合法或 keyId 不匹配时构建必须失败，不能回退为自动信任网页公钥。不得传入任何服务端私钥，也不得把包含真实公钥的生成文件提交到公开仓库。

后台权限为系统权限 `PRIV_EDIT_SYSTEM`；更改配置、生成密钥、查看私钥、删除日志还要求 sudo 二次授权。域管理员不能读取其他域的日志。默认页面及生成接口仅返回两组公钥；“查看私钥”是单独的主动操作，生产环境要求 HTTPS，响应禁止缓存、审计只记录操作与 keyId，关闭弹窗清除展示。不要把私钥截图或通过聊天发送。

默认配置：精确版本 `1.0.0`，令牌 300 秒（范围 60–1800），允许刷新，比赛结束后 30 天可补传（范围 1–365），单文件 64 MiB（范围 1–256）。关闭全局服务时，已开启监考的比赛**拒绝提交**，不会降级成普通比赛。

私钥文件存放在 `$HYDRO_PROCTOR_KEY_DIR/<keyId>.json`，默认 `~/.hydro/proctor-keys`；目录 0700、新文件 0600。Docker 部署必须持久化此目录；多副本必须共享一致的受保护密钥目录。数据库、日志存储与密钥都应备份，密钥备份单独限制访问。除经过 sudo 的主动私钥查看接口外，私钥不会进入接口响应；不写入前端构建、普通页面数据或日志文件列表。

轮换密钥立即使旧会话/挑战失效，需要可信方式更新客户端预置公钥并重新握手。旧 RSA 私钥文件保留，以验证/解密历史日志；不要随意删除。更改要求版本也立即使不匹配版本的握手、刷新、提交和上传失败；客户端更新后保留设备私钥和原日志再握手补传。

## 域与规范化

主域接口：`/contest/{tid}/proctor`。子域接口：`/d/{domainId}/contest/{tid}/proctor`。始终保留域路径。

`operation` 放在 JSON 请求体中，上传时放在 multipart 字段中。必须发送 `Accept: application/json`。日期使用 ISO 8601 UTC，签名时间戳使用 Unix **毫秒**，域 ID 使用服务端返回的规范域 ID（大小写不能自行改写）。

签名/摘要规范化规则：UTF-8 JSON，所有对象键按 JavaScript `Object.keys(...).sort()` 排序，递归处理对象，数组保持原顺序，无空白；字符串用标准 JSON 转义。禁止 undefined、NaN、Infinity。ObjectId 统一为 24 位小写字符串。SHA-256 输出小写 64 位十六进制；签名及随机数使用无 padding 的 base64url。

## 0. 可验签的登录上下文

客户端不能使用页面中的用户名、UiContext 或自报管理员标志决定是否解除保护。新增 `POST /proctor/identity`，域内为 `POST /d/<domainId>/proctor/identity`，沿用 Electron 的 OJ 登录 Cookie 和 JSON 请求头：

```json
{ "clientNonce": "32字节随机数base64url", "tid": "可选比赛ObjectId", "problem": "可选题目显示PID" }
```

服务端返回 `{payload,signature}`，signature 使用现有认证 Ed25519 私钥对规范化 payload 签名：

```json
{
  "protocol": "hydro-proctor/1", "action": "identity", "keyId": "32位keyId",
  "origin": "https://oj.example.com", "clientNonce": "原始随机数",
  "uid": 7, "domainId": "exam", "root": false,
  "tid": "无比赛时为空字符串，否则原始比赛ID", "routePid": "原始显示PID或空字符串",
  "pid": 100, "proctorEnabled": true, "expiresAt": "60秒后ISO时间"
}
```

无题目时 pid=0；未登录 uid=0，不能建立考试会话。传入比赛时，已登录用户必须有比赛查看权限并报名，系统 root 可读取上下文；传入题目还要求该题属于比赛。`root` 仅在 已登录且拥有 `PRIV_ALL` 超级管理员权限 时为 true，不能由用户名决定。无题目/比赛时 routePid/tid 也明确返回空字符串。此接口限速且 no-store。

客户端验证完整签名、nonce、origin、keyId、tid、routePid、过期时间和 UID/root 类型。它将显示 PID 映射到服务端签名的数字 pid，避免提交证明被用于其它题目。root 调试还须由构建 config 的 `debug.allowRoot` 允许；只有已验证的 root 才解除应用网络及 Windows 防火墙限制。普通账号、验签失败或切换账号撤销调试。调试不会豁免后续提交认证。

## 1. 挑战与双向握手

POST 接口，JSON 请求：

```json
{
  "operation": "challenge",
  "version": "1.0.0",
  "fingerprint": "64位小写SHA256环境指纹",
  "clientNonce": "32字节安全随机数的base64url",
  "publicKey": "-----BEGIN PUBLIC KEY-----\n客户端设备 Ed25519 SPKI PEM\n-----END PUBLIC KEY-----\n",
  "deviceInfo": { "platform": "win32", "osVersion": "10.0.26100", "arch": "x64" }
}
```

成功响应 `{payload, signature}`。`payload` 包含：

| 字段 | 含义 |
| --- | --- |
| protocol / action | `hydro-proctor/1` / `handshake` |
| challengeId / serverNonce | 服务端安全随机数 |
| origin | 服务端感知的公开 origin，部署代理后必须正确 |
| uid / domainId / tid | 用户、域、比赛绑定 |
| keyId | 当前服务端签名密钥 ID |
| clientNonce / publicKey | 原始客户端随机数与规范化客户端公钥 |
| fingerprint / version | 当前环境和精确版本 |
| deviceInfo | 设备概要（platform / osVersion / arch，每项至多 128 字符） |
| expiresAt | 挑战有效期，120 秒 |

客户端必须先用**预置**签名公钥验证完整 payload 的 Ed25519 签名，再校验 origin、UID、域、比赛、clientNonce、自己的公钥、版本、指纹和过期时间。不得从同一个未认证响应下载公钥后直接信任它。

随后用客户端私钥对**同一个完整 payload** 签名：

```json
{ "operation": "handshake", "challengeId": "响应中的ID", "signature": "客户端签名base64url" }
```

挑战仅能使用一次。签名通过后直接签发令牌，无需任何人工登记。成功响应：

```json
{
  "token": "只返回一次的随机令牌",
  "payload": {
    "protocol": "hydro-proctor/1",
    "action": "session",
    "tokenHash": "令牌SHA256",
    "attemptId": "本次考试监考记录ID",
    "uid": 7,
    "domainId": "exam",
    "tid": "1234567890abcdef12345678",
    "version": "1.0.0",
    "fingerprint": "64位指纹",
    "keyId": "服务端密钥ID",
    "expiresAt": "2026-10-10T10:05:00.000Z",
    "refreshEnabled": true
  },
  "signature": "服务端对payload的签名"
}
```

客户端再次验证服务端签名和 tokenHash，再自动接受令牌。令牌不能放在 URL、浏览器 localStorage 或审计日志中，应由客户端主进程保管。服务端仅保存令牌 SHA-256、UID、服务端观察到的 IP、设备概要和用于认证的设备公钥/指纹/版本，以及域、比赛、attempt、创建/到期时间、撤销状态，不保存明文令牌或维护注册客户端名册。IP 取受控代理配置下的 request.ip，不接受请求体自报 IP；刷新时记录新 IP，网络切换不会直接取消资格。会话到期按 MongoDB TTL 清理，鉴权同时显式检查到期时间。

每个 UID/域/比赛只有一个 attempt；重启续写同一个 attempt，设备公钥或指纹改变将拒绝继续。旧注册协议的设备信息只用于已有 attempt 的兼容核验，不再新增注册记录；旧会话需要重新自动握手。上传已成功但响应丢失时，重新握手会返回 `{completed:true, receipt:日志ID}`，不会重开考试。

## 2. 每次提交/刷新/结束/上传的签名证明

请求携带：

```text
x-proctor-token: <token>
x-proctor-proof: <base64url(UTF8(JSON.stringify({payload, signature})))>
```

proof payload：

```json
{
  "protocol": "hydro-proctor/1",
  "action": "submit",
  "method": "POST",
  "path": "/d/exam/p/1/submit",
  "tokenHash": "令牌SHA256",
  "fingerprint": "握手指纹",
  "version": "当前精确版本",
  "payloadHash": "以下语义请求体规范化JSON的SHA256",
  "timestamp": 1791626400000,
  "nonce": "每次请求重新生成的32字节随机数base64url"
}
```

`signature` 为客户端 Ed25519 私钥对规范化 proof payload 的签名。`path` 为实际 URL pathname，包括 `/d/...`，不包含 query；比赛通过服务端会话的 tid 和提交路由参数绑定。时间允许 ±60 秒，nonce 原子去重，禁止重复请求。失败重试必须生成新的 nonce/proof。

| action | 请求体 operation | payloadHash 对应的对象 |
| --- | --- | --- |
| submit | 原有提交接口 | `{pid,lang,code,pretest,input,fileHash}` |
| refresh | refresh | `{}` |
| finish | finish | `{}` |
| upload | upload | `{filename,size,sha256}` |

提交沿用 `/p/{pid}/submit?tid={tid}` 或带域前缀。proof 的 `pid` 必须是数值 `pdoc.docId`，不是显示 PID。`lang`、`code` 取提交时原值，规范化换行/语言映射由服务端在验签之后进行；pretest 是 boolean，input 无数据为 `[]`，fileHash 无文件为 `""`。上传代码文件时 fileHash 是原文件全部字节的 SHA-256，code 没有值时为 `""`。自测同样必须认证。重放关联字段不影响代码请求摘要，不改变原有代码回放流程。

当前协议不支持 Codeforces 插件的 Hack 提交；监考比赛会明确拒绝该入口，避免未签名的请求绕过监考认证。普通比赛不受影响。

ui-next 在受监考比赛调用预加载桥：

```js
window.examAPI.proctorHeaders({
  action: 'submit', method: 'POST', path: '/d/exam/p/1/submit',
  payload: { pid: 1, lang: 'cc.cc20', code: '...', pretest: false, input: [], fileHash: '' }
})
// Promise<{ 'x-proctor-token': string, 'x-proctor-proof': string }>
```

桥接主进程必须限定目标 origin、域、比赛、path、action，且不提供“任意文本签名”接口。提交文件/其它客户端提交入口需要主进程按相同规范补充头部；不能修改客户端代码时，普通浏览器提交会被服务端拒绝。管理员也没有监考提交豁免。

### 刷新

在过期前（建议剩余 1/3 有效期）POST `{operation:"refresh"}`，action=refresh。响应结构与会话下发相同，客户端验证后原子替换令牌。旧令牌立即撤销；并发刷新只有一次成功。刷新关闭或令牌过期时，重新 challenge/handshake，同一设备继续同一 attempt；不会重开已结束的考试。版本或密钥不匹配必须先可信更新客户端。

## 3. 结束与日志补传

结束前等待所有提交响应，然后 POST `{operation:"finish"}`，action=finish。此时 attempt 进入 closing，新提交立即禁止，成绩待日志确认。若仍有在处理的提交，服务端拒绝完成，等待后用新 proof 重试。服务器故障留下的提交租约最长 5 分钟后过期。

客户端生成最终加密文件后 multipart POST：

```text
operation=upload
file=<最终 .hplog 文件>
```

proof action=upload，摘要对象 `{filename:原始文件名,size:字节数,sha256:完整文件SHA256}`；不签整个 multipart 编码。文件名最多 120 个主体字符，只允许字母、数字、空格、`_ . -`，扩展名 `.hplog`，不能携带路径。

文件成功存储、元数据成功落库后才标记 complete 和 proctorLogUploaded；上传失败保留原评测结果为未确认。相同最终文件重传幂等，不允许覆盖成另一份文件。网络恢复后，沿用设备密钥和环境指纹重新握手（即使比赛已结束），再上传。补传期限从比赛总 endAt 起算；已结束比赛的会话只能补传，不能再次提交代码。

GET 同一接口可查询 `{state,logUploaded,receipt}`，receipt 包含日志 ID、文件名、上传时间和 SHA-256，用于确认丢失响应。客户端必须得到上传成功回执或查询确认，才能删除本地待上传文件；禁止把“调用上传”视为已成功。

### 加密文件格式

```text
HYDRO-PROCTOR-LOG/1\n
{"keyId":"32位keyId","iv":"base64url","tag":"base64url","wrappedKey":"base64url"}\n
<剩余全部字节为 AES-256-GCM 密文>
```

首两行加起来必须小于 8192 字节，不得使用 CRLF。为每份最终文件生成全新 32 字节 AES 密钥和 12 字节 IV；16 字节认证 tag。AAD 为 UTF-8 `HYDRO-PROCTOR-LOG/1:<keyId>`。wrappedKey 是 RSA-3072 公钥通过 OAEP-SHA256 包装 AES 密钥所得的 384 字节，所有头部二进制值采用 base64url 无 padding。RSA 公钥与 keyId 一起从受信安装配置/验证后的策略取得。

服务端流式验证 OAEP/GCM 完整性，不解析、索引或保存日志明文；存储与下载的都是原加密文件。管理员下载后可在受控离线工具中使用对应 RSA 私钥解密，不会通过网页暴露解密私钥。

## 4. 日志管理与成绩

**监考日志直接位于监考设置页**（`/manage/proctor`）下方，无需点击右上角入口。默认每页 25 条，可切换 50 条；列表显示文件名、上传用户名、上传时间、域、比赛、大小，支持搜索、翻页、单文件下载、勾选批量 ZIP 下载和二次确认删除。列表独立请求数据，翻页和搜索不丢失上方配置表单的未保存内容。单次批量操作最多 50 个文件；ZIP 流式输出，不把批量日志全部加载进服务端内存。`/manage/proctor/logs` 保留为列表/文件管理接口及旧地址兼容入口。内部另外保存文件摘要、attempt关联和存储路径，用于验证幂等与安全关联；不收集客户端日志明文内容。

比赛进行中可显示临时成绩；用户结束监考、个人比赛时限已到或比赛结束后，只有最终日志成功上传才进入正式排行、排行导出和比赛 RP 计算。未上传者不删除原评测记录；补传成功恢复排名资格，RP 仍按现有定期/手动重算流程更新。管理员删除日志也会撤销资格，重新补传后恢复。删除沿用 Hydro 的文件存储回收策略，底层文件通常延迟 7 天清理。上传和删除通过跨进程租约互斥；异常进程留下的日志操作租约最长 15 分钟后可重试。

不将“日志已上传”自动视为“无作弊”；日志审阅与作弊处罚另行处理。本功能不删除用户在非比赛场景的已通过题目/普通提交记录。

## 5. 错误和联调测试

错误沿用 Hydro `{error:{name,message,params}}`，大多返回 403（鉴权/策略）或 400（字段/文件）。客户端必须检查 HTTP 状态、error 和回执；不要无限重试版本错误或指纹错误。报错中不得输出 token、私钥或完整 proof。

至少测试：主域与子域、普通浏览器、未报名用户、自动首次握手、设备信息字段限制、过期/错误版本/撤销会话、跨 UID/域/比赛复用、代码改变而签名不变、proof 重放、并发刷新、提交与结束并发、无日志成绩排除、错 GCM tag/错 RSA key、断网重启续写、补传恢复资格、上传响应丢失、25/50 分页与批量 ZIP、删除与上传并发、私钥查看权限及缓存、密钥目录丢失与备份恢复。
