import { useEffect, useState, useCallback } from 'react';
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

  const handleMessage = useCallback((data: any) => {
    if (data.rid === rid || !rid) {
      setRecord((prev) => ({ ...prev, ...data }));
    }
  }, [rid]);

  const { send } = useWebSocket({
    url: 'record-detail-conn',
    onMessage: handleMessage,
    autoReconnect: true,
    reconnectInterval: 5000,
  });

  // Subscribe to a specific record
  useEffect(() => {
    if (rid) {
      send({ operation: 'subscribe', rid });
    }
    return () => {
      if (rid) {
        send({ operation: 'unsubscribe', rid });
      }
    };
  }, [rid, send]);

  return record;
}
