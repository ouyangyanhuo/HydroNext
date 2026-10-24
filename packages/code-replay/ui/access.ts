import type { ProctorAccessRequest } from '@hydrooj/ui-next';

export function replayAccessRequest(target: URL): ProctorAccessRequest | null {
  const match = target.pathname.match(/^\/(?:d\/[^/]+\/)?record\/([a-f0-9]{24})\/replay(?:\/data)?$/i);
  return match ? { action: 'record_view', method: 'GET', path: target.pathname, payload: { rid: match[1].toLowerCase() } } : null;
}
