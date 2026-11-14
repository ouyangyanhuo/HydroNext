# GitHub 登录（ui-next）

`@hydrooj/login-with-github-next` 使用 Hydro 的 OAuth 服务及 ui-next 现有的登录按钮、账号绑定和分组设置表单，不依赖 ui-default，也不复制登录页面。

## 启用与配置

1. 在仓库根目录安装插件：`yarn hydrooj addon add "$PWD/packages/login-with-github-next"`，然后重启服务。
   本仓库的 Docker 后端会默认加载该插件，但 **GitHub 登录默认关闭**。
2. 如果正在使用 `login-with-github`，先停用旧插件。两者不能同时注册同一个 `github` 登录提供者。
   旧插件的凭据不会自动复制，请在下面的管理页面重新填写；已有 GitHub 账号绑定沿用，不需要重新绑定。
3. 使用系统管理员账号进入管理模式，访问 `/manage/setting`，找到「GitHub 登录」栏目。
4. 确保「服务地址 / server.url」是实际的完整公网地址（生产环境使用 HTTPS），且包含正确的路径前缀。
5. 在 GitHub 的 Settings → Developer settings → OAuth Apps 创建 OAuth App。
   将管理设置中显示的「GitHub 授权回调地址」原样复制到 Authorization callback URL。
   例如：`https://oj.example/oauth/github/callback`。
6. 填入 Client ID、Client Secret，选择注册策略，勾选「启用 GitHub 登录」并保存。立即生效，无需重启。

Client Secret 仅在服务端保存，不返回给浏览器；管理表单留空会保留原密钥。
启用后，登录页显示带 GitHub 图标的登录按钮；个人安全设置也可绑定或解绑 GitHub。
本插件面向 github.com，不提供任意 OAuth/API 服务器地址配置。

## 登录与账号策略

- 沿用提供者标识 `github` 和 GitHub 不变的数字用户 ID，因此 GitHub 改名不影响已有绑定。
- 已绑定的 GitHub 账号登录对应的 OJ 账号。
- 没有绑定时，沿用 Hydro 的邮箱关联策略：仅使用 GitHub API 返回的 **已验证邮箱** 匹配已有账号。
  不相信公开用户资料中的 `email` 字段，也不使用未验证邮箱。
- 新账号需同时满足系统注册开关及插件的「允许通过 GitHub 注册」，并通过 Hydro 原有注册流程。
- 在个人安全设置发起绑定时，必须由同一浏览器会话、同一登录用户完成回调；不能覆盖已绑定给其他人的账号。
- 已有账号从 `/d/{域ID}/login` 等域内页面发起，登录完成后返回原域内的安全站内路径；新账号注册沿用 Hydro 原有的注册完成跳转。
  任意外站跳转、协议相对地址及反斜杠地址会被拒绝。

## 安全边界与部署

- 每次授权生成随机 state、浏览器会话 nonce 和 PKCE verifier；state 有效期 10 分钟，绑定发起用户及配置。
- 回调检查同一浏览器会话、有效期、绑定意图、发起用户及配置指纹，并在交换授权码前原子消费 state。
- 使用 PKCE S256；密钥轮换、Client ID/回调地址变更后，旧授权流程失效，需重新发起。
- 固定访问 GitHub HTTPS 地址，禁止 HTTP 重定向，设置请求超时；不持久化 GitHub Access Token，不回显远端错误详情。
- 管理设置沿用系统的 `PRIV_EDIT_SYSTEM` 与管理模式检查；密码字段在服务端做额外响应脱敏。
- OAuth 回调固定使用 `server.url` 的站点。自定义域名必须能与该地址共享登录会话；否则请从标准站点地址登录，不能绕过会话校验。
- 反向代理必须转发 `/oauth/github/login`、`/oauth/github/callback`，并正确处理 HTTPS 和会话 Cookie。
- 如果自定义 `HYDRO_ADDONS`，请加入 `/opt/hydro-addons/login-with-github-next`。

规范参考：[GitHub OAuth 授权与 PKCE](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps)、
[已验证邮箱接口](https://docs.github.com/en/rest/users/emails)。

自动化测试使用模拟 GitHub 响应；真实 GitHub 授权仍需由管理员配置有效的 OAuth App 后验证。

## 找不到配置栏目时

确认启动日志中已加载本插件，且 HTTP 监听确实成功。如果出现 `EADDRINUSE`，当前浏览器很可能还在访问旧实例；
请停止旧服务，或使用其它 `--port` 并访问对应地址。成功加载插件后，栏目会出现在 `/manage/setting`，关闭 GitHub 登录也不会隐藏管理栏目。
