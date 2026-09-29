# ui-next 公共选择框规范与迁移清单

## 公共入口

从 `@/components/common/select` 导入三个组件：

| 组件 | 使用位置 | 默认行为 |
| --- | --- | --- |
| `ShortSelect` | 工具栏、筛选、播放速度 | 紧凑尺寸，不搜索；可显式开启搜索 |
| `LongSelect` | 表单、文件、语言等完整字段 | 填满所在表单列，支持搜索；固定枚举可传 `searchable={false}` |
| `TagMultiSelect` | 题目、语言、用户等多项选择 | 填满所在表单列，支持搜索和已选标签 |

它们保留 Mantine 的 `value`、`defaultValue`、`onChange`、`onSearchChange`、`renderOption`、`clearable`、`disabled`、`error`、`ref` 等接口。
单选回调仍接收字符串或 `null`，多选仍接收字符串数组。组件不负责请求接口、权限判断或 localStorage。

统一样式位于 `packages/ui-next/src/styles/select.css`；`classNames` 支持对象和函数形式，并与公共样式合并。
下拉层默认使用 Portal；原有 `comboboxProps` 可以覆盖，避免特殊弹窗场景受限。

## 短款尺寸

```tsx
<ShortSelect
  width={220}
  height={36}
  aria-label="排序方式"
  data={options}
  value={sort}
  onChange={setSort}
/>
```

- 默认宽度 160px，默认 `size="xs"`；已有页面可保留原来的尺寸配置。
- `width` 使用像素，限制为 72–320px；`height` 使用像素，限制为 24–48px。
- `height` 指输入控件本身，不包含标签和说明文字。
- 兼容现有 Mantine `w`、`size` 和布局类；CSS 同时将宽度限制为父容器宽度与 320px 中的较小值，高度不超过 48px。
- `width` 优先于 `w`。无效的数值忽略，不将 `NaN`、`Infinity` 传给 CSS。
- 需要更大表单控件时使用 `LongSelect`，而不是解除短款上限。

## 调用迁移清单

以下路径均相对于 `packages/ui-next/src/`。原有单选和多选业务回调未改变。

| 文件 | 字段／位置 | 改用组件 |
| --- | --- | --- |
| `components/common/list-sort-select.tsx` | 题目列表和训练列表的排序 | `ShortSelect`；保留排序记忆逻辑 |
| `components/common/paginator.tsx` | 每页行数 | 例外：保留独立 Mantine `Select`，xs 字号、76px 宽度；页码使用 `sm`，不要传数值尺寸影响字号 |
| `components/common/settings-form.tsx` | 个人、系统等动态设置字段 | `LongSelect` |
| `components/common/form-dialog.tsx` | 通用弹窗的 select 类型字段 | 原生 `<select>` 改为 `LongSelect`；保留空值、必填和提交校验 |
| `components/editor/scratchpad.tsx` | 在线编辑器语言、编辑器主题 | 语言为可搜索 `ShortSelect`；主题为 `LongSelect` |
| `components/record/code-replay.tsx` | 回放速度 | `ShortSelect`；保留 80px 宽度 |
| `pages/contest_main.tsx` | 分类、赛制过滤 | `ShortSelect` |
| `pages/contest_scoreboard.tsx` | 排行榜用户过滤 | `ShortSelect` |
| `pages/contest_detail.tsx` | 提问主题 | `LongSelect` |
| `pages/contest_clarification.tsx` | 答疑主题 | `LongSelect` |
| `pages/contest_edit.tsx` | 赛制、权限控制 | `LongSelect` |
| `pages/contest_edit.tsx` | 题目、比赛维护者、提交语言限制 | `TagMultiSelect`；异步搜索、头像选项保留 |
| `pages/record_main.tsx` | 语言、评测状态过滤 | 可搜索 `ShortSelect`；宽度跟随表单列且不超过 320px |
| `pages/problem_statistics.tsx` | 排序依据、方向、语言 | `ShortSelect`；语言搜索保留 |
| `pages/problem_submit.tsx` | 提交语言 | `LongSelect` |
| `pages/problem_hack.tsx` | Hack 语言 | `LongSelect` |
| `pages/problem_files.tsx` | 数据生成器、标准程序 | `LongSelect` |
| `pages/problem_config.tsx` | 类型、校验器、接口、交互器、管理器、相关语言、子任务类型、输入／输出文件 | `LongSelect` |
| `pages/problem_config.tsx` | 允许语言、用户额外文件、评测额外文件 | `TagMultiSelect` |
| `pages/training_main.tsx` | 分类内的训练计划 | `TagMultiSelect` |
| `pages/training_edit.tsx` | 训练题目 | `TagMultiSelect` |
| `pages/domain_join_applications.tsx` | 加入方式、角色分配 | `LongSelect` |
| `pages/domain_user.tsx` | 添加用户的角色 | `LongSelect` |
| `pages/domain_user.tsx` | 用户行角色、批量角色 | `ShortSelect` |
| `pages/manage_script.tsx` | 脚本及动态枚举参数 | `LongSelect` |

已移除排序框、提交筛选和在线编辑器的重复下拉样式，页面只保留必要的布局类。
`AsyncTagSelect`、`ListSortSelect` 继续作为业务封装，但内部使用上述公共组件。

## 验证

`packages/ui-next/tests/select-components.spec.ts` 检查尺寸边界、属性与 ref 透传、样式合并，
并使用现有 jsdom 环境验证弹出选择、搜索、清空、多选标签和明暗主题下的渲染。
另有扫描测试防止页面重新直接使用 Mantine `Select` / `MultiSelect` 或原生 `<select>`；分页组件为明确保留的独立样式例外。
这不等同于真实浏览器的布局或截图验收。
