import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/stores/session';

interface WebSocketOptions {
  url: string;
  onMessage?: (data: any) => void;
  onOpen?: () => void;
  onClose?: () => void;
  onError?: (event: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  enabled?: boolean;
}

export function useWebSocket({
  url,
  onMessage,
  onOpen,
  onClose,
  onError,
  autoReconnect = true,
  reconnectInterval = 3000,
  enabled = true,
}: WebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingMessages = useRef<any[]>([]);
  const shouldReconnect = useRef(autoReconnect);
  const ui = useSessionStore((s) => s.ui);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsPrefix = ui.ws_prefix || '/';
    const fullUrl = url.startsWith('ws') ? url : `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}${wsPrefix}${url}`;

    try {
      const ws = new WebSocket(fullUrl);

      ws.onopen = () => {
        // console.log('[Hydro WS] Connected:', url);
        for (const message of pendingMessages.current.splice(0)) {
          ws.send(JSON.stringify(message));
        }
        onOpen?.();
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessage?.(data);
        } catch {
          // Non-JSON message
        }
      };

      ws.onclose = () => {
        // console.log('[Hydro WS] Disconnected:', url);
        onClose?.();
        if (shouldReconnect.current) {
          reconnectTimer.current = setTimeout(connect, reconnectInterval);
        }
      };

      ws.onerror = (err) => {
        // console.warn('[Hydro WS] Error:', url);
        onError?.(err);
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      // console.warn('[Hydro WS] Failed to connect:', err);
      if (shouldReconnect.current) {
        reconnectTimer.current = setTimeout(connect, reconnectInterval);
      }
    }
  }, [enabled, url, ui.ws_prefix, onMessage, onOpen, onClose, onError, autoReconnect, reconnectInterval]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
      return;
    }
    pendingMessages.current.push(data);
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    shouldReconnect.current = autoReconnect;
    connect();
    return () => {
      shouldReconnect.current = false;
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect, enabled, autoReconnect]);

  return { send, ws: wsRef };
}
