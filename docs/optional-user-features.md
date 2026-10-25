# 可选业务插件

以下功能分别由独立 Hydro addon 提供，不是 ui-next 或服务端核心的必选功能。

| 插件 | 目录 | 提供的功能 |
| --- | --- | --- |
| 荣誉头像框 | `packages/honor-frame` | 管理、素材、授予/收回、用户设置、个人主页与头像装饰 |
| 代码回放 | `packages/code-replay` | 编辑器录制、提交关联、回放接口与 ui-next 回放页面 |
| 客户端更新中心 | `packages/client-updates` | 更新包库、发布策略、更新清单及下载接口 |
| 历史贡献图 | `packages/user-contributions` | 全站每日解题数、连续天数和个人主页热力图 |
| 编辑器粘贴策略 | `packages/editor-paste-guard` | 代码粘贴长度限制、权限豁免及通知 |

## 开启或关闭

源码部署可在仓库根目录执行，然后重启服务：

```sh
yarn hydrooj addon add /绝对路径/Hydro/packages/honor-frame
yarn hydrooj addon add /绝对路径/Hydro/packages/code-replay
yarn hydrooj addon add /绝对路径/Hydro/packages/client-updates
yarn hydrooj addon add /绝对路径/Hydro/packages/user-contributions
yarn hydrooj addon add /绝对路径/Hydro/packages/editor-paste-guard
```

关闭时把 `add` 改成 `remove`，路径必须与添加时完全相同。也可以直接维护运行账户的 `~/.hydro/addon.json`。保留 ui-next，按需加入功能插件路径：

```json
[
  "/绝对路径/Hydro/packages/ui-next",
  "/绝对路径/Hydro/packages/honor-frame",
  "/绝对路径/Hydro/packages/code-replay",
  "/绝对路径/Hydro/packages/client-updates",
  "/绝对路径/Hydro/packages/user-contributions",
  "/绝对路径/Hydro/packages/editor-paste-guard"
]
```

Docker 后端镜像默认加载 ui-next 和上述五项功能，以保持升级兼容性。可在 Compose 的 `oj-backend.environment` 中设置 `HYDRO_ADDONS`，随后重新创建后端容器。例如仅保留界面、不启用这些可选功能：

```yaml
environment:
  HYDRO_ADDONS: '["/opt/hydro-addons/ui-next"]'
```

不要把这些地址写进前端设置；它们是容器内部路径。修改插件列表后需要重启服务并刷新浏览器，不支持在现有页面中热卸载。

如果已自定义 `HYDRO_ADDONS`，升级不会覆盖该列表；需要手动补入本次新增的三个路径。源码部署也需要显式启用新插件。只需要重建并重新创建 `oj-backend`，不需要更换数据库、删除数据卷或重建评测机。

## 数据和权限

- 不删除或重命名原数据库集合、用户头像框字段、素材路径、回放接口及浏览器草稿存储键。
- 关闭头像框插件后，管理/设置入口与头像装饰不再加载，显示普通头像。重新开启后恢复原授予及佩戴状态。
- 关闭回放插件后，编辑器不初始化录制器、不上传回放；代码编写、自测与正式提交仍可使用。已有回放数据保留，重新启用后可访问。
- 插件路由仅在启用时注册。头像框管理继续使用系统管理权限和管理模式；回放读取继续使用服务端提交记录鉴权，不依赖前端隐藏按钮保障权限。
- 头像框归属仍是全站账户级，不允许域内字段覆盖。回放提交仍使用当前域、题目和比赛上下文；自测不推进正式提交的回放检查点。
- 更新中心继续使用 `client-update.asset`、`client-update.settings` 集合与 `client-update/` 文件路径，保留 `/client-updates/version.json` 和原下载地址、已发布清单、草稿及发布历史。版本号允许降低的规则不变，管理权限、管理模式、同源校验、发布校验和并发版本控制保留。停用后不注册接口，也不运行清理任务；再次启用会继续处理管理员此前已确认删除的清理队列。
- 贡献图仍按全站各域题目的首次通过记录统计，排除自测及生成数据的记录，日期按 UTC+8，最近一年/月仍为包含当天的 365/30 天。只向页面提供日期和数量，不返回私有域或题目信息。停用后既不显示卡片，也不执行统计；不修改基础提交计数或 RP。
- 粘贴上限保留拆分前代码中的 **30 个 Unicode 码点**，不改回历史的 50 字符版本；原题目/域编辑权限与系统管理员豁免不变。策略现在也覆盖比赛专用题目地址。它仅是前端交互约束，不能替代服务端鉴权或作为可信防作弊手段；停用后不注册监听器。

## 扩展边界

核心仅提供用户序列化事件、用户主页并行扩展事件、头像显示插槽、页面/菜单插槽、管理入口注册、用户扩展字段和编辑器扩展接口，以及通用文件哈希、请求与翻译工具。插件各自持有功能页面、样式、翻译、业务模型及测试，不反向导入 ui-next 的私有源码。

后端插件入口是各自的 `index.ts`，前端入口是各自的 `ui/index.ts` 或 `ui/index.tsx`。ui-next 按实际启用的 addon 发现并打包前端入口，开发模式同样按此列表加载。
