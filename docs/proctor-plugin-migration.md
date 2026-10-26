# 监考系统插件迁移

监考后端与 ui-next 实现位于 `packages/proctor`，包名 `@hydrooj/proctor`。核心保留强制校验接口、比赛监考标记、存储兼容字段和团队证据同步。客户端源码不作修改。

## 代码归属

| 原位置 | 新位置 / 处理方式 |
| --- | --- |
| hydrooj/src/model/proctor.ts | proctor/model/store.ts；由插件 index.ts 单次初始化 |
| hydrooj/src/handler/proctor.ts | proctor/handler.ts；保留原四类路由及权限 |
| hydrooj/src/lib/proctor*.ts | proctor/lib/；规范化、签名、密文验证、访问规则、团队展示算法 |
| problem/contest/record 的具体认证调用 | hydrooj/src/lib/contest-security.ts 公共强制接口 |
| contest 模型及 rating 脚本的具体排名过滤 | 同一公共接口调用插件过滤算法 |
| ui-next 的监考管理页面、日志页及状态组件 | proctor/ui/pages、proctor/ui/components |
| ui-next/src/utils/proctor.ts | proctor/ui/utils/proctor.ts；核心改用 registry/request-security.ts |
| 管理首页内置监考卡片、内置页面注册 | 插件 registerManageEntry/registerPage |
| 比赛编辑开关、参赛/结束提示 | 通用插槽由监考插件实现 |
| 代码回放的监考请求依赖 | 通用 protectedAccessHeaders 和保护路径注册 |
| 赛事增强的具体结束监考组件依赖 | 通用 ContestFinishAction 插槽 |
| 监考测试及翻译 | proctor/tests、proctor/locale；共享翻译继续保留核心 |

详情见 [行为基线](./proctor-migration-baseline.md) 和 [兼容契约](./proctor-migration-contract.md)。

## 启用与部署

源码部署添加绝对路径并重启：

此插件依赖本次配套核心的 `contest-security` 接口，需连同核心改动一起发布，不能仅将插件复制到没有这些接口的上游 Hydro 5.0.7。

```sh
yarn hydrooj addon add /绝对路径/Hydro/packages/proctor
```

Docker backend 已建立 `/opt/hydro-addons/proctor` 链接并默认启用。重新构建和创建 `oj-backend`，保留数据库和原数据卷，不需要重建评测机。

自定义 `HYDRO_ADDONS` 时，必须将 `/opt/hydro-addons/proctor` 加入现有数组；默认列表不会覆盖自定义列表。源码插件入口同样需要显式添加。所有副本应使用相同配置和镜像。

维持原 `HYDRO_PROCTOR_KEY_DIR` 或 `~/.hydro/proctor-keys`，原 keyId、公私钥文件和日志对象都不移动。Docker `/root/.hydro` 已由原 backend 数据卷持久化，自定义密钥目录仍需自行挂载。不要点击重新生成密钥来完成迁移。

插件未加载时，非监考业务正常；已要求监考的操作被明确拒绝，监考排名也不会放宽为无过滤查询。前端监考入口不注册。恢复插件配置后重启服务并刷新浏览器。

## 本次验证记录

验证在独立临时配置和 MongoDB 内存实例进行，未连接生产数据库，也未读取生产私钥。

2026-10-26 验证结果：

| 检查 | 结果 |
| --- | --- |
| `yarn test`，启用全部功能插件 | 654 项单元测试、40 项应用集成测试通过 |
| 应用集成测试，停用监考插件并保留回放/赛事增强 | 40 项通过；监考专属 fixture 由启用插件提供 |
| 客户端现有 protocol/access/queue/journal/upload 测试 | 50 项通过；只更新被忽略的编译产物，客户端工作区没有源码改动 |
| 真实客户端 ProctorAuth 与 AuditLogger 对接 OJ | 主域、子域身份验签、握手、题单/题目读取、nonce 重放拒绝、刷新、结束后拒绝、真实加密日志上传及 completed 回执恢复通过 |
| 插件停用 HTTP 检查 | 题目/题单/自测提交/排行榜拒绝；普通题库可访问，监考管理路由不存在，监考集合未初始化 |
| 插件开发与生产加载 | 入口、路由、懒加载代码、生产插件 CSS 检查通过 |
| TypeScript、`yarn lint:ci`、`yarn build:ui-next` | 通过；构建仍有原有的大分块提示 |
| Docker 默认插件配置 | proctor 路径存在且仅出现一次；本次未实际构建或部署 Docker 镜像 |

应用集成测试可使用单独运行账户的 addon.json 重现；它启动测试专用 MongoDB 内存实例。不要把验证配置指向生产账户或数据库。客户端测试可在客户端目录编译后运行：

```sh
node --experimental-strip-types scripts/compile.mts
node --test out/tests/protocol.spec.js out/tests/access.spec.js out/tests/queue.spec.js out/tests/journal.spec.js out/tests/upload.spec.js
```

Electron 原生网络、操作系统安全存储、Windows/macOS 防护、真机异常重启及代理环境仍需真机验收。Node 协议测试不代替这些平台检查。

## 已知边界

既有客户端不是硬件或官方二进制远程证明；加密日志内层 binding 的额外核对、团队 RP 参数、精确结束时刻的比较差异并未在本次迁移中改变。对应源码依据和影响记录在行为基线末尾，不能将本次插件化等同于这些事项已经加固。
