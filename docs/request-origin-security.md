# 请求来源与跨站请求防护

普通 GET、HEAD、OPTIONS 保持读取语义。POST、PUT、PATCH、DELETE 在业务执行前检查来源；切换账号这个已有写入型 GET 也显式开启检查。

- 存在 Origin 时，严格核对协议、主机与端口。Origin 无效、为 null 或不匹配时直接拒绝，不回退到 Referer。
- 没有 Origin 时核对 Referer；两者均缺失时，拒绝明确标记为 cross-site 的请求。same-site 不等于 same-origin，不能据此信任其他子域。
- 同源 Fetch Metadata、application/json 或 X-Requested-With: XMLHttpRequest 可作为兼容依据。后两种跨源浏览器请求需要 CORS 预检；Accept: application/json 不是防护依据。
- 没有来源依据的普通表单、纯文本和 multipart 上传被拒绝。正常浏览器表单、编辑器提交及上传已有 Origin 或 Referer，不需修改客户端协议。
- WebSocket 同样检查存在的来源头；原生评测机等不携带来源头时保留原有连接认证。来源检查不代替凭据、订阅权限或监考证明。

## 评测机与监考兼容

评测机现有登录、测试数据链接请求使用 JSON，WebSocket 使用 Bearer 凭据，继续兼容。唯一的旧式简单请求豁免位于 JudgeFileUpdateHandler：只有专用评测上传接口、通过 PRIV_JUDGE 权限、并且没有浏览器 Fetch Metadata 的请求才可不携带来源头。外站或 null 来源不会进入这个豁免；judge=on、User-Agent 和管理员身份本身不是全局豁免。

这是保留现有机器 Cookie 协议的有限兼容边界，不是对客户端程序身份的证明。长期可将机器 HTTP 调用迁移为独立、可撤销的非 Cookie 凭据，但本次不要求重新构建评测机。

监考客户端现有协议请求和日志上传已经发送正确的 Origin，令牌和签名仍按原规则校验；无需改客户端格式。测试中的 multipart 请求同步模拟这个真实行为。

## CORS、代理与第三方调用

server.cors 的旧 host[:port] 条目只允许当前目标协议；也可写完整的 http(s)://host[:port]，按完整来源精确匹配。只加入真正受信任的来源，不使用通配子域。白名单来源仍须通过业务认证与权限检查。

优先使用 server.url 中与当前请求 Host 相匹配的完整公网来源，避免主站 HTTPS 在代理内转为 HTTP 后误拦截。localhost、不同端口及其他域绑定的主机不会套用主站来源；它们按实际请求协议与主机核对。

反向代理必须保留外部 Host，并正确转发 HTTPS 协议；只有受信任的代理可以控制转发头。自定义域尤其需要正确配置代理。不要为消除报错而全局开启 allowCors。现有专用签名扩展的 allowCors 由扩展自行承担验证责任。

第三方脚本在没有来源头时，应使用 JSON 或明确的 XMLHttpRequest 请求头；模拟普通表单、空 POST 或 multipart 的脚本需提供正确来源或由接口实现专门的机器认证策略。来源头不是机器身份凭据。跨站来源冲突时，即使携带 Bearer 也不自动放行。

本防护不解决同源 XSS、被盗会话及代理配置不当。不会修改数据库结构、监考密钥、已有令牌格式或 CORS 白名单配置。
