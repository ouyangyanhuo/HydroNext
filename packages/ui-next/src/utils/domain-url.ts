export function getDomainPrefix(
  domainId: string,
  domainHost: string | string[] | undefined,
  currentHost: string,
  targetDomainId = domainId,
): string {
  const domainHosts = (Array.isArray(domainHost) ? domainHost : [domainHost]).filter(Boolean);
  const unprefixedDomainId = domainHosts.includes(currentHost) ? domainId : 'system';
  return targetDomainId === unprefixedDomainId ? '' : `/d/${targetDomainId}`;
}
