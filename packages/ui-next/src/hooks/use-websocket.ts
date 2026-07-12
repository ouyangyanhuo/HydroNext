import { useEffect, useRef, useCallback } from 'react';
import { useSessionStore } from '@/stores/session';

interface WebSocketOptions {
  url: string;
  onMessage?: (data: any) => void;
  onOpen?: (send: (data: any) => void) => void;
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
  const connectRef = useRef<() => void>(() => {});
  const handlersRef = useRef({ onMessage, onOpen, onClose, onError });
  const ui = useSessionStore((s) => s.ui);

  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose, onError };
  }, [onClose, onError, onMessage, onOpen]);

  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.CONNECTING || wsRef.current?.readyState === WebSocket.OPEN) return;

    const wsPrefix = ui.ws_prefix || '/';
    const prefixUrl = new URL(wsPrefix, window.location.href);
    prefixUrl.protocol = prefixUrl.protocol === 'https:' ? 'wss:' : 'ws:';
    if (!prefixUrl.pathname.endsWith('/')) prefixUrl.pathname += '/';
    const fullUrl = url.startsWith('ws') ? url : new URL(url.replace(/^\/+/, ''), prefixUrl).toString();

    const scheduleReconnect = () => {
      if (!shouldReconnect.current) return;
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(() => connectRef.current(), reconnectInterval);
    };

    try {
      const ws = new WebSocket(fullUrl);

      ws.onopen = () => {
        // console.log('[Hydro WS] Connected:', url);
        for (const message of pendingMessages.current.splice(0)) {
          ws.send(JSON.stringify(message));
        }
        handlersRef.current.onOpen?.((data) => ws.send(JSON.stringify(data)));
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          handlersRef.current.onMessage?.(data);
        } catch {
          // Non-JSON message
        }
      };

      ws.onclose = () => {
        // console.log('[Hydro WS] Disconnected:', url);
        if (wsRef.current === ws) wsRef.current = null;
        handlersRef.current.onClose?.();
        scheduleReconnect();
      };

      ws.onerror = (err) => {
        // console.warn('[Hydro WS] Error:', url);
        handlersRef.current.onError?.(err);
        ws.close();
      };

      wsRef.current = ws;
    } catch (err) {
      // console.warn('[Hydro WS] Failed to connect:', err);
      scheduleReconnect();
    }
  }, [enabled, reconnectInterval, ui.ws_prefix, url]);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

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
