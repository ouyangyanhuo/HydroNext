/** 域路径必须与页面一致；系统域和独立域名页面保留空前缀。 */
export function pageDomainPath(pathname: string): string {
  return pathname.match(/^\/d\/[^/]+(?=\/|$)/)?.[0] || '';
}

export function buildWebSocketUrl({ url, prefix, pageUrl, domainId, domainPath }: {
  url: string;
  prefix: string;
  pageUrl: string;
  domainId?: string;
  domainPath?: string;
}): string {
  const target = new URL(prefix || '/', pageUrl);
  target.protocol = ['https:', 'wss:'].includes(target.protocol) ? 'wss:' : 'ws:';
  if (!target.pathname.endsWith('/')) target.pathname += '/';
  if (domainPath !== undefined || domainId) {
    const basePath = target.pathname.replace(/\/d\/[^/]+\/$/, '/');
    const scope = domainPath ?? `/d/${encodeURIComponent(domainId!)}`;
    target.pathname = `${basePath}${scope.replace(/^\//, '')}${scope ? '/' : ''}`;
  }
  return url.startsWith('ws') ? url : new URL(url.replace(/^\/+/, ''), target).toString();
}
