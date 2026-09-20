export function buildRecordSocketUrl(rid: string | undefined, domainId: string): string {
  if (!rid) return 'record-detail-conn';
  const query = new URLSearchParams({ rid, noTemplate: 'true', domainId });
  return `record-detail-conn?${query}`;
}
