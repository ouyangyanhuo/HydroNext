import { useCallback, useState } from 'react';
import { useSessionStore } from '@/stores/session';
import { buildRecordSocketUrl } from '@/utils/record-socket-url';
import { pageDomainPath } from '@/utils/websocket-url';
import { useWebSocket } from './use-websocket';

interface RecordUpdate {
  status?: number;
  score?: number;
  time?: number;
  memory?: number;
  cases?: any[];
  judgeText?: string;
  compilerText?: string;
  progress?: any;
  error?: { name?: string, params?: unknown[] };
}

/**
 * Subscribes to real-time record updates via WebSocket.
 * The backend broadcasts record/change events through /record-detail-conn.
 */
export function useRecordSocket(rid: string | undefined) {
  const domainId = useSessionStore((state) => state.ui.domainId);
  const domainPath = typeof window === 'undefined' ? '' : pageDomainPath(window.location.pathname);
  const context = `${domainId}${domainPath}/${rid || ''}`;
  const [update, setUpdate] = useState<{ context: string, record: RecordUpdate } | null>(null);
  const socketUrl = buildRecordSocketUrl(rid, domainId);

  const handleMessage = useCallback((data: any) => {
    const payload = data?.rdoc || data;
    if (!payload) return;
    const payloadRid = payload._id || payload.rid;
    if (rid && payloadRid && String(payloadRid) !== String(rid)) return;
    setUpdate((prev) => {
      const record = { ...(prev?.context === context ? prev.record : {}), ...payload };
      if (!payload.error) delete record.error;
      return { context, record };
    });
  }, [context, rid]);

  const handleFailure = useCallback(() => {
    setUpdate((prev) => prev?.context === context && prev.record.error ? prev : {
      context,
      record: { ...(prev?.context === context ? prev.record : {}), error: { name: 'RecordConnectionError' } },
    });
  }, [context]);

  const handleClose = useCallback((event?: CloseEvent) => {
    if (event?.code !== 4001) handleFailure();
  }, [handleFailure]);

  useWebSocket({
    url: socketUrl,
    domainPath,
    onMessage: handleMessage,
    onClose: handleClose,
    onError: handleFailure,
    // A reconnect obtains the current snapshot; terminal 4001/Ended stays closed.
    autoReconnect: true,
    reconnectInterval: 5000,
    enabled: !!rid,
  });

  return update?.context === context ? update.record : null;
}
