# ui-next 按钮组件

公共入口：`@/components/common/button`。

| 组件 | 用途 |
| --- | --- |
| `Button` | 普通文字按钮、提交按钮、链接按钮 |
| `ActionIcon` | 图标按钮 |
| `UnstyledButton` | 自定义导航和列表操作 |
| `ButtonBase` | 原生按钮语义的标签页、移除标签等特殊控件 |

保留原有 `size`、宽高、`color`、`variant`、`loading`、`disabled`、`component`、`renderRoot`、`ref` 和事件接口。
公共样式仅管理悬停底色/阴影、按压反馈、键盘焦点及禁用状态，不设置按钮尺寸或字号。
支持明暗主题、自定义主题色和减少动态效果偏好，不使用渐变背景。

分页保持专用组件与字号；Mantine 内部生成的菜单项、选择框选项、分页控制等仍由原组件管理，不替换其内部 DOM。
Markdown 代码复制按钮由 DOM 增强逻辑创建，复用同一交互样式。

本次迁移 77 个调用文件，共 308 个 JSX 按钮调用。

## 调用清单

- `components/auth/oauth-buttons.tsx`
- `components/common/confirm-dialog.tsx`
- `components/common/delete-resource-button.tsx`
- `components/common/file-preview-modal.tsx`
- `components/common/file-uploader.tsx`
- `components/common/form-dialog.tsx`
- `components/common/settings-form.tsx`
- `components/editor/scratchpad.tsx`
- `components/navigation/domain-switcher.tsx`
- `components/navigation/font-menu.tsx`
- `components/navigation/language-menu.tsx`
- `components/navigation/top-nav.tsx`
- `components/record/code-replay.tsx`
- `pages/code_replay.tsx`
- `pages/contest_balloon.tsx`
- `pages/contest_clarification.tsx`
- `pages/contest_detail.tsx`
- `pages/contest_edit.tsx`
- `pages/contest_main.tsx`
- `pages/contest_manage.tsx`
- `pages/contest_print.tsx`
- `pages/contest_scoreboard.tsx`
- `pages/contest_user.tsx`
- `pages/domain_create.tsx`
- `pages/domain_dashboard.tsx`
- `pages/domain_edit.tsx`
- `pages/domain_group.tsx`
- `pages/domain_join.tsx`
- `pages/domain_join_applications.tsx`
- `pages/domain_permission.tsx`
- `pages/domain_role.tsx`
- `pages/domain_user.tsx`
- `pages/error.tsx`
- `pages/home_domain.tsx`
- `pages/home_files.tsx`
- `pages/home_messages.tsx`
- `pages/home_security.tsx`
- `pages/homepage.tsx`
- `pages/homework_detail.tsx`
- `pages/homework_edit.tsx`
- `pages/manage_config.tsx`
- `pages/manage_dashboard.tsx`
- `pages/manage_script.tsx`
- `pages/manage_system_data.tsx`
- `pages/manage_user.tsx`
- `pages/manage_user_import.tsx`
- `pages/manage_user_priv.tsx`
- `pages/problem_config.tsx`
- `pages/problem_detail.tsx`
- `pages/problem_edit.tsx`
- `pages/problem_files.tsx`
- `pages/problem_hack.tsx`
- `pages/problem_import.tsx`
- `pages/problem_import_hydro.tsx`
- `pages/problem_main.tsx`
- `pages/problem_random.tsx`
- `pages/problem_solution.tsx`
- `pages/problem_statistics.tsx`
- `pages/problem_submit.tsx`
- `pages/ranking.tsx`
- `pages/record_detail.tsx`
- `pages/record_main.tsx`
- `pages/training_detail.tsx`
- `pages/training_edit.tsx`
- `pages/training_files.tsx`
- `pages/training_main.tsx`
- `pages/user_delete_pending.tsx`
- `pages/user_detail.tsx`
- `pages/user_login.tsx`
- `pages/user_lostpass.tsx`
- `pages/user_lostpass_mail_sent.tsx`
- `pages/user_lostpass_with_code.tsx`
- `pages/user_register.tsx`
- `pages/user_register_mail_sent.tsx`
- `pages/user_register_with_code.tsx`
- `pages/user_sudo.tsx`
- `pages/user_verify.tsx`

