import { useCallback, useState } from 'react';
import { useSessionStore } from '@/stores/session';
import { buildRecordSocketUrl } from '@/utils/record-socket-url';
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
}

/**
 * Subscribes to real-time record updates via WebSocket.
 * The backend broadcasts record/change events through /record-detail-conn.
 */
export function useRecordSocket(rid: string | undefined) {
  const [record, setRecord] = useState<RecordUpdate | null>(null);
  const domainId = useSessionStore((state) => state.ui.domainId);
  const socketUrl = buildRecordSocketUrl(rid, domainId);

  const handleMessage = useCallback((data: any) => {
    const payload = data?.rdoc || data;
    if (!payload) return;
    const payloadRid = payload._id || payload.rid;
    if (rid && payloadRid && String(payloadRid) !== String(rid)) return;
    setRecord((prev) => ({ ...prev, ...payload }));
  }, [rid]);

  useWebSocket({
    url: socketUrl,
    onMessage: handleMessage,
    autoReconnect: false,
    reconnectInterval: 5000,
    enabled: !!rid,
  });

  return record;
}
