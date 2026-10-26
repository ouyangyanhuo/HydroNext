# 监考插件迁移行为基线

核对日期：2026-10-26（UTC+8）。基线来自本仓库 OJ 与 `exam-proctor-client` 源码，不代表已核对生产数据库、线上代理配置或用户实际安装包。

迁移前 OJ 基准提交：`2200e41495b1f351c868b6aff0110f2ffb9ea073`；客户端基准提交：`a615e2745e41749188c42f229eca64ad8f2b3af8`。本次保持客户端源码不变。

## 通信与身份

实际协议标识为 `hydro-proctor/1`。设备与服务端认证签名使用 Ed25519；日志使用独立 RSA-3072/OAEP-SHA256 包装 AES-256-GCM 密钥。构建时的 `PROCTOR_AUTH_PUBLIC_KEY`、`PROCTOR_LOG_PUBLIC_KEY`、`PROCTOR_KEY_ID` 已由客户端 `scripts/prepare-build.ts` 读取。

设备 Ed25519 私钥及本地日志密钥由客户端系统安全存储保护。指纹绑定安装 ID、设备公钥、平台及架构，不包含 IP、系统启动时间和系统更新版本。服务端接受自动握手的设备公钥，因此当前机制证明设备私钥持有及会话绑定，不构成官方安装包或硬件远程证明。公钥也不是秘密。

所有业务身份基于 Hydro 登录 Cookie；监考令牌不能代替登录。用户、当前域、比赛、真实 UID、设备密钥、指纹、精确客户端 `version` 共同绑定；客户端更新的 `buildVersion` 不参与现有监考精确版本校验。

## HTTP 接口清单

以下地址同时支持主域路径和 `/d/{domainId}` 前缀。请求发送 `Accept: application/json`，签名路径采用实际 pathname，保留域前缀且不带 query。

| 地址与操作 | 当前行为 | 关键校验 |
| --- | --- | --- |
| `POST /proctor/identity` | 返回 `{payload, signature}` 的身份、比赛、显示 PID 到数字 PID 映射；可通过 rid 解析实际比赛 | 新 nonce、同源、身份签名；报名和题目归属；root 根据 `PRIV_ALL` |
| `POST /contest/{tid}/proctor`，`challenge` | 返回服务端签名挑战，120 秒有效 | 登录、域权限、报名、全局及比赛监考开关、精确版本、指纹与设备公钥 |
| 同地址，`handshake` | 一次性消费挑战；创建或续接 attempt；返回令牌和签名会话 | 完整挑战签名；同用户/域/比赛；原设备与指纹不变 |
| 同地址，`refresh` | 撤销旧令牌，签发新令牌 | `refresh` 请求证明、刷新开关；重复刷新拒绝 |
| 同地址，`finish` | attempt 变为 closing；标记本人已结束 | `finish` 证明；存在提交占用时要求稍后重试 |
| 同地址，`upload` | multipart 字段 operation=upload、file 为最终日志；返回 `{ok:true, receipt}` | `upload` 证明、文件名/大小/哈希、加密完整性、上传锁、补传期限 |
| `GET /contest/{tid}/proctor` | 返回本人 state、logUploaded、receipt；不返回令牌/私钥 | 登录、域权限、报名、比赛监考及补传期限；不额外要求 GET proof |
| `/manage/proctor` | 设置、生成密钥、主动查看私钥 | `PRIV_EDIT_SYSTEM`、sudo、同源、no-store、审计 |
| `/manage/proctor/logs` | 搜索、25/50 条分页、最多 50 个去重 ID 的下载/删除 | 系统管理权限及 sudo；多文件流式 ZIP；删除撤销日志成绩资格 |

服务端数据库仅保存令牌 SHA-256；客户端主进程保存明文令牌。握手已完成的 attempt 返回 `{completed:true, receipt}`，不再创建可继续考试的会话。

## 读取与提交校验矩阵

| 场景 | action / method | 签名语义对象 | 当前豁免与边界 |
| --- | --- | --- | --- |
| 题目、提交页 GET、题目附件，带 tid | `problem_view` / GET | `{tid, pid:显示题号字符串}` | 监考比赛全局结束后按普通复盘权限；进行中做题无管理员自动豁免 |
| 比赛题单、打印、私有比赛附件 | `contest_view` / GET | `{tid}` | 打印/私有附件管理保留所有者及比赛编辑权限豁免；普通题单仍需证明 |
| 正式提交与比赛自测 | `submit` / POST | `{pid:数字文档ID,lang,code,pretest,input,fileHash}` | 两者均认证、占用提交租约；签名前后不得擅自变换 code 或 lang |
| 记录详情、源码下载、代码回放及其数据 | `record_view` / GET | `{rid}` | 比赛所有者或编辑比赛者保留管理读取；原本的代码可见权限继续叠加 |
| `/record-detail-conn?rid=...` | `record_view` / GET 握手 | `{rid}` | 每次推送前重新检查会话与 attempt；失效关闭 4002；不重复消费握手 nonce |
| Hack | 不在协议支持范围 | 无 | 启用监考时拒绝 Hack 提交 |

普通不带 tid 的题库路径仍由题库权限决定，提交不计入比赛。监考认证不替代隐藏题目、比赛报名、开始时间、域权限、代码读取权限。赛后复盘不等于允许继续提交比赛代码。

自测记录的 contest 使用固定标识，实际归属从 `pretestContest` 读取；身份接口、详情与实时连接必须保持一致。代码回放通过核心 `getRecordAccess` 继承同一校验。

proof 包含 protocol、action、method、path、tokenHash、fingerprint、version、payloadHash、毫秒 timestamp、每请求新 nonce。对象键递归排序、数组保留顺序、UTF-8 无空白 JSON，SHA-256 小写十六进制，签名/随机数 base64url。时间偏差上限 60 秒，nonce 记录保留 180 秒并原子去重。

## 生命周期与并发

| 对象 | 状态或时限 | 保持的语义 |
| --- | --- | --- |
| attempt | open → closing → complete | 同 UID/域/比赛唯一；设备与指纹固定；重启不重新分配 attempt |
| session | 默认 300 秒，允许 60–1800 秒 | 版本或 keyId 不匹配、撤销、到期均拒绝；刷新旧会话只成功一次 |
| 提交租约 | 300 秒，每 30 秒续租 | 开始提交先取得租约；写记录前检查租约；成功或失败均释放 |
| 上传/删除锁 | 15 分钟，持有者随机值 | 同 attempt 跨 worker 串行；旧持有者不能释放新锁 |
| 客户端日志 | open → closing → pending-upload → uploaded | 退出确认、封存、上传回执属于不同步骤；暂停保留开放日志 |
| 补传 | 默认赛后 30 天，允许 1–365 天 | 原账号、设备与比赛绑定不变；失败保留本地文件；已完成结果通过状态与哈希确认 |

每位队员独立监考。队长提前结束只停止全队提交，不会代替队员上传日志。比赛结束或个人时间到后，最终日志缺失的个人/团队不应被视为有效排名；赛中仍可展示符合现有过滤规则的暂定成绩。日志删除恢复为 closing 并撤销上传标记，保留原评测记录。

核心保留 `proctorEnabled`、个人日志状态和 `proctorMembers` 的存储兼容与团队成员同步，避免退队/入队时丢失或串用证据。密钥、验签、令牌、日志文件校验及有效成绩过滤算法由插件持有。

## 持久化与部署依赖

`proctor.config`、`proctor.device`（旧 attempt 只读兼容）、`proctor.challenge`、`proctor.attempt`、`proctor.session`、`proctor.nonce`、`proctor.lease`、`proctor.log` 的名称及字段保持。challenge/session/nonce/lease 的 expiresAt TTL、attempt 的域/比赛/用户唯一索引及 log 的 attemptId 唯一索引保持。

私钥目录仍为 `$HYDRO_PROCTOR_KEY_DIR` 或 `~/.hydro/proctor-keys`；目录 0700，新文件 0600，文件名 `<keyId>.json`。日志对象仍为 `proctor-log/{id}.hplog`。Docker 原 `/root/.hydro` 和文件存储挂载继续使用，更新插件时不生成新密钥、不清理旧会话、不重写历史数据。

`.hplog` 为首行 `HYDRO-PROCTOR-LOG/1`、次行 JSON 包含 keyId/iv/tag/wrappedKey、随后密文；服务端验证 GCM 完整性后丢弃解密流，不索引明文。客户端内部 journal 使用序列与前一条哈希，异常重启续写并记录异常退出和系统重启。

## 核对发现的既有差异

1. 旧协议文档称客户端尚未读取构建公钥变量，与当前 `scripts/prepare-build.ts` 不符；客户端 README 的 `HydroNext-proctor/1` 与双方实际常量不符。兼容以实际 `hydro-proctor/1` 为准。
2. `requireProctorAccess` 使用 `now > endAt`，记录读取使用 `now >= endAt`；本次保留该边界，不在迁移中顺带调整。
3. 服务端验证加密日志完整性，但尚未解析内层 journal binding 并逐项与当前 attempt 比对。外层上传证明绑定用户/域/比赛/attempt 及文件哈希，不能将其描述为已审计日志内容真实性。内层绑定与事件完整性审核属于后续独立加固事项。
4. RP 脚本现有调用没有传团队过滤参数；本次保留原算法，不把插件迁移描述为修复了团队 RP 规则。
5. WebSocket 会话失效检查发生在推送之前，并非定时主动断开所有失效连接；不得把迁移结果描述为即时定时撤销机制。

此基线与 [兼容契约和验收清单](./proctor-migration-contract.md)、[迁移部署说明](./proctor-plugin-migration.md) 配套。
