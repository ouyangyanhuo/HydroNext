# HydroNext

[![hydrooj](https://img.shields.io/npm/dm/hydrooj)](https://www.npmjs.com/package/hydrooj)
[![npm](https://img.shields.io/npm/v/hydrooj?label=hydrooj)](https://www.npmjs.com/package/hydrooj)
[![node-current](https://img.shields.io/node/v/hydrooj)](https://www.npmjs.com/package/hydrooj)
[![GitHub contributors](https://img.shields.io/github/contributors/ouyangyanhuo/HydroNext)](https://github.com/ouyangyanhuo/HydroNext/graphs/contributors)
[![GitHub commit activity](https://img.shields.io/github/commit-activity/y/ouyangyanhuo/HydroNext)](https://github.com/ouyangyanhuo/HydroNext/commits/master)
[![license](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)

HydroNext 是基于 [hydro-dev/Hydro](https://github.com/hydro-dev/Hydro) 的下游发行版，在同步上游核心代码的基础上，替换了全新的 React 前端，并针对线上考试、教学训练与运维场景提供了开箱可用的功能。

上游 Hydro 是一个高效的信息学在线测评系统，HydroNext 保留了它的全部能力：模块化插件架构、单系统多域（domain）隔离、精细的权限系统、多赛制与全题型支持、一键备份导入。在此之上，HydroNext 增加了：

- **全新的 React 前端 `ui-next`** —— React 19 + Vite + Mantine 构建的单页应用，页面通过注册表与后端插件对接；
- **在线监考客户端（Electron）** —— 与后端 `HydroNext-proctor/1` 协议配套的桌面端，用于考试过程中的设备与网络管控、日志上传；
- **荣誉边框** —— 512×512 可穿戴头像框，管理员上传、授予，用户自行佩戴；
- **代码回放** —— 录制选手在编辑器中的完整作答过程，赛后按提交记录回放；
- **团队参赛** —— 队伍创建、邀请码加入、队长管理与赛后成员归属；
- **客户端热更新** —— 后台托管监考客户端安装包，支持签名校验与版本下发；
- **主题配色** —— 四套预置强调色方案（默认 / 蓝 / 紫 / 玫红），深浅色自适应。

系统开发文档位于 [`docs/`](docs/)，按开发、安装、系统管理、插件、API 与用户指南分类组织（中英双语）。

> 本项目为 Hydro 的修改版，依据 AGPL-3.0 第 7(c) 条已更名为 HydroNext，并保留上游版权声明与署名。

## 环境要求

| 组件 | 版本 |
|---|---|
| Node.js | `>= 22` |
| MongoDB | `7` |
| Yarn | `4`（`packageManager: yarn@4.17.0`） |
| go-judge（评测沙箱） | `1.13.3`（Docker 镜像中已固定版本并校验 SHA-256） |

## 快速开始

```bash
# 安装依赖（postinstall 会执行 build/prepare.js）
yarn

# 构建后端（TypeScript 编译）
yarn build

# 构建前端（二选一）
yarn build:ui      # 旧版 ui-default（Nunjucks / Webpack）
yarn build:ui-next # 新版 ui-next（Vite / React）

# 启动服务，默认监听 8888 端口
yarn start
```

启动后访问 `http://localhost:8888/`，根据引导创建管理员账号与域（domain）。

### 开发模式

```bash
yarn debug              # 调试模式启动后端（--debug --template --trace）
yarn build:watch        # 后端增量编译
yarn build:ui:dev       # ui-default 开发模式（watch）
yarn workspace @hydrooj/ui-next dev   # ui-next 开发服务器（HMR 端口 3010）
```

## 目录结构

```
packages/      核心包（hydrooj、hydrojudge、ui-default、ui-next、code-replay 等）
framework/     框架层（web 服务、路由、装饰器、工具）
docs/          系统开发文档（中英双语）
install/       部署相关（docker、helm-single、nix、install.sh）
test/          集成测试
examples/      示例配置与插件（examples/plugins/ 为插件示例）
```

## 前端

### ui-next（新版，默认）

`packages/ui-next` 是 Vite + React 19 + Mantine 9 + Tailwind 4 构建的单页应用。后端 `ui-next` 包以 `priority: 100` 注册了 `next` 渲染器，接管所有模板的 HTML 输出，把路由名与序列化后的上下文注入 SPA 外壳，由前端按路由渲染对应页面（当前共 82 个页面）。

页面通过注册表装配，插件无需改动前端源码即可扩展界面：

```ts
import {
  installPlugin, defineSlot, registerPage, registerLayout, intercept,
} from '@/registry';

api.registerPage('example_home', () => import('./pages/example_home'));
api.registerLayout('wide', WideLayout);
api.intercept('page:home_dashboard', (props, next) => next(props), { priority: 0 });
defineSlot('app:sidebar:bottom', MySidebar);
```

可用拦截器：`before` / `after` / `patch` / `replace` / `wrap` / `intercept`。`priority` 数值越小越靠外、越先执行。一个完整的插件示例见 [`examples/plugins/ui-next-plugin/`](examples/plugins/ui-next-plugin/)：后端 `index.ts` 返回模板名 `example_home.html`，`ui/index.tsx` 注册同名页面。

前端特性包括：Monaco 编辑器、Markdown 渲染（KaTeX / highlight.js）、代码回放播放器、贡献图、题目统计、四套强调色主题、深浅色模式，以及简体中文 / 繁体中文 / 英文 / 日文 / 韩文界面翻译。

可通过环境变量 `HYDRO_UI_NEXT_DISABLE` 或系统设置禁用前端包，回退到 `ui-default`。

### ui-default（旧版）

`packages/ui-default` 是基于 Nunjucks 模板与 Webpack 的传统前端，版本号 `4.58.5`。在新前端尚未覆盖的场景、自定义模板或迁移期间可作为备选。

## 在线监考

HydroNext 包含一套完整的在线监考方案：Electron 桌面客户端（`exam-proctor-client/`，产品名「在线监考客户端」）与后端 `packages/hydrooj/src/handler/proctor.ts`。协议规范见 [`docs/proctor-protocol.md`](docs/proctor-protocol.md)，要点：

- 协议版本 `HydroNext-proctor/1`，要求 HTTPS；身份端点 `/proctor/identity`（按域为 `/d/<domainId>/proctor/identity`）；
- 设备密钥由客户端在主进程自动生成（Ed25519），无需注册码；
- 服务端使用 Ed25519 签名密钥与独立的 RSA-3072/OAEP-SHA256 日志密钥（共用同一 keyId），日志以 256-bit 不透明 token 标识并以 SHA-256 存储；
- 默认策略：客户端版本精确匹配、token 有效期 300 秒（60–1800）、赛后 30 天（1–365）内可补传日志、单文件上限 64 MiB（1–256）。

管理端页面：`/manage/proctor`（配置、密钥与授权）、`/manage/proctor/logs`（日志管理与成绩）、比赛中页面 `/contest/:tid/proctor`。配置与私钥查看需要 `PRIV_EDIT_SYSTEM` 权限并二次验证（sudo）。密钥默认存放于 `HYDRO_PROCTOR_KEY_DIR`（默认 `~/.hydro/proctor-keys`），Docker 部署需持久化该目录。

客户端构建见 `exam-proctor-client/.github/workflows/build.yml`（手动触发，输入构建类型、版本号、目标地址与更新源等）。

> 安全提示：客户端公钥可从安装包中提取，隐藏公钥不能证明程序未被修改；切勿将服务端私钥写入任何提交。

## 部署

### Docker Compose

仓库根目录的 `docker-compose.yml` 提供 mongo + backend + judge 三件套：

```bash
docker compose up -d
```

- `oj-mongo`：`mongo:7-jammy`；
- `oj-backend`：`hydrooj/backend:latest`，映射 `8282:8888`，数据卷 `./data/file:/data/file`、`./data/backend:/root/.hydro`；
- `oj-judge`：`hydrooj/judge:latest`，需 `privileged: true`，沙箱监听容器内 `127.0.0.1:5050`。

后端镜像构建时会执行 `yarn workspace @hydrooj/ui-next vite build`，并把 `ui-next` 与 `code-replay` 软链接到 `/opt/hydro-addons`。维护脚本与备份说明见 [`install/docker/README.md`](install/docker/README.md)：默认每日 03:00 备份并重启，使用 flock 与 Compose v2 `start --wait`；备份为单份全量，存放于 `backup-file/` 并以 `.hydro-backup` 标记。

### Helm / Nix / 安装脚本

- **Helm**：`install/helm-single`，Chart 配置见 `values.yaml`；
- **Nix**：`install/nix`（`default.nix`、`env.nix`、`hydro.nix`）、`install/install.ts`（`nix profile install github:hydro-dev/nix-channel/master#...`）；
- **一键脚本**：`install/install.sh`（v3.0.1，需 root，包含系统遥测提示，会调用 `curl https://hydro.ac/nix.sh`）；
- **重置 / 卸载**：`install/reset.sh`、`install/uninstall.sh`。

### 评测机

独立的评测机由 `packages/hydrojudge` 驱动，通过 WebSocket 连接后端，调用本机 `http://localhost:5050` 的 go-judge 沙箱执行代码；判题使用固定的 testlib 版本（Docker 镜像中已固定 commit 并校验 SHA-256）。数据库备份与恢复命令：

```bash
yarn hydrooj backup
yarn hydrooj restore <filename>
```

## 常用命令

CLI 通过 `packages/hydrooj/bin/hydrooj.js` 提供：

```bash
yarn debug cli                 # 进入交互式 CLI
yarn hydrooj install <pkg>     # 安装插件
yarn hydrooj uninstall <pkg>   # 卸载插件
yarn hydrooj addon list        # 列出已加载插件
yarn hydrooj addon create <name>
yarn hydrooj db                # 数据库维护
yarn hydrooj backup            # 备份数据库
yarn hydrooj restore <file>    # 恢复数据库
yarn hydrooj diag              # 诊断信息
```

## 测试与代码检查

```bash
yarn test:unit   # Node.js 测试运行器 + Chai，运行 framework/ 与 packages/*/tests/*.spec.ts
yarn test        # 单元测试 + test/entry.js 集成测试
yarn lint:ci     # ESLint 零告警检查
yarn oxlint      # oxlint 检查
```

## 贡献代码

仓库约定见 [AGENTS.md](AGENTS.md)（Yarn 4 TypeScript 单仓结构、代码风格、命名规范、提交规范）与 [CONTRIBUTING.md](CONTRIBUTING.md)。提交说明使用 Conventional Commits 格式，例如 `feat: add theme selector`、`fix(domain & judge): apply domain config`。改动 UI 的 PR 需要附截图；提交者需要对 AI 辅助的改动负责并能够解释，自动提交不被接受。

## 开源许可

- `framework/`、`examples/`、`install/` 下的内容采用 MIT 协议；
- `packages/ui-default/` 下的内容仅采用 AGPL-3.0；
- 项目其余部分为 AGPL-3.0 附加条款下的许可，如需闭源使用可联系我们获取其他授权。

### 附加条款

基于 AGPL-3.0 第七条，使用本项目需遵守以下额外条款：

1. 不可移除本项目的版权声明与作者/来源署名；（[AGPL3 7(b)](LICENSE#L356)）
2. 重分发经修改后的软件时，需在软件名或版本号中以可识别的方式注明；（[AGPL3 7(c)](LICENSE#L360)）
3. 除非得到许可，不得以宣传为目的使用作者姓名；（[AGPL3 7(d)](LICENSE#L364)）

部署 HydroNext 时需保留页脚的 `Powered by Hydro` 字样，其中 `Hydro` 字样需指向 `hydro.js.org/本仓库/fork` 之一的链接；对源码的修改需以 AGPL-3.0-or-later 开源，可按 `Powered by Hydro, Modified by xxx` 格式在页脚注明。

## 鸣谢

排名不分先后，按照链接字典序

- [GitHub](https://github.com/) 提供代码托管与自动构建。
- [criyle](https://github.com/criyle) 提供评测沙箱实现。
- [Hydro](https://github.com/hydro-dev/Hydro) 上游项目。
- [Vijos](https://github.com/vijos/vj4) 为 Hydro 提供了 UI 框架。

## Sponsors

- [云斗学院](https://www.yundouxueyuan.com)
