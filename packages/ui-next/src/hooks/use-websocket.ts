import { useCallback, useEffect, useRef } from 'react';
import { useSessionStore } from '@/stores/session';

interface WebSocketOptions {
  url: string;
  /** Explicit domain scope for domain-owned endpoints; preserves any deployment path prefix. */
  domainId?: string;
  onMessage?: (data: any) => void;
  onOpen?: (send: (data: any) => void) => void;
  onClose?: (event?: CloseEvent) => void;
  onError?: (event: Event) => void;
  autoReconnect?: boolean;
  reconnectInterval?: number;
  heartbeatTimeout?: number;
  heartbeatProbeTimeout?: number;
  connectionTimeout?: number;
  enabled?: boolean;
}

// Transport-level 1000 can also be a proxy/server restart; only explicit business/policy stops are terminal.
const TERMINAL_CLOSE_CODES = new Set([1008, 4000, 4001]);
const duration = (value: number, fallback: number) => Number.isFinite(value) && value > 0 ? value : fallback;

export function useWebSocket({
  url,
  domainId,
  onMessage,
  onOpen,
  onClose,
  onError,
  autoReconnect = true,
  reconnectInterval = 3000,
  heartbeatTimeout = 120_000,
  heartbeatProbeTimeout = 10_000,
  connectionTimeout = 30_000,
  enabled = true,
}: WebSocketOptions) {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingMessages = useRef<any[]>([]);
  const canQueue = useRef(enabled);
  const recoverRef = useRef<() => void>(() => {});
  const handlersRef = useRef({ onMessage, onOpen, onClose, onError });
  const ui = useSessionStore((s) => s.ui);

  useEffect(() => {
    handlersRef.current = { onMessage, onOpen, onClose, onError };
  }, [onClose, onError, onMessage, onOpen]);

  useEffect(() => {
    if (!enabled) return undefined;
    canQueue.current = true;
    const wsPrefix = ui.ws_prefix || '/';
    const prefixUrl = new URL(wsPrefix, window.location.href);
    prefixUrl.protocol = ['https:', 'wss:'].includes(prefixUrl.protocol) ? 'wss:' : 'ws:';
    if (!prefixUrl.pathname.endsWith('/')) prefixUrl.pathname += '/';
    if (domainId) {
      const basePath = prefixUrl.pathname.replace(/\/d\/[^/]+\/$/, '/');
      prefixUrl.pathname = `${basePath}d/${encodeURIComponent(domainId)}/`;
    }
    const fullUrl = url.startsWith('ws') ? url : new URL(url.replace(/^\/+/, ''), prefixUrl).toString();
    const idleTimeout = duration(heartbeatTimeout, 120_000);
    const probeTimeout = duration(heartbeatProbeTimeout, 10_000);
    const openTimeout = duration(connectionTimeout, 30_000);
    const page = window.document;
    let disposed = false;
    let stopped = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let watchdog: number | undefined;
    let lastReceived = Date.now();
    let connectingAt = lastReceived;
    let lastCheck = lastReceived;
    let probeAt: number | null = null;
    let networkInterrupted = false;
    let connect: () => void;
    const current = (socket: WebSocket) => !disposed && wsRef.current === socket;
    const retire = () => {
      const socket = wsRef.current;
      wsRef.current = null;
      probeAt = null;
      if (!socket) return;
      // Abandon half-open sockets without waiting for their close event to arrive.
      socket.onopen = null;
      socket.onmessage = null;
      socket.onclose = null;
      socket.onerror = null;
      socket.close();
    };
    const scheduleReconnect = () => {
      if (disposed || stopped || !autoReconnect || reconnectTimer !== undefined) return;
      reconnectTimer = setTimeout(() => {
        reconnectTimer = undefined;
        connect();
      }, duration(reconnectInterval, 3000));
    };
    const fail = (event?: CloseEvent) => {
      if (disposed || stopped) return;
      stopped = !autoReconnect || Boolean(event && TERMINAL_CLOSE_CODES.has(event.code));
      retire();
      if (stopped) {
        window.clearInterval(watchdog);
        clearTimeout(reconnectTimer);
        reconnectTimer = undefined;
        canQueue.current = false;
        pendingMessages.current = [];
      }
      try {
        handlersRef.current.onClose?.(event);
      } finally {
        scheduleReconnect();
      }
    };
    connect = () => {
      if (disposed || stopped) return;
      if (wsRef.current?.readyState === WebSocket.CONNECTING || wsRef.current?.readyState === WebSocket.OPEN) return;
      connectingAt = Date.now();
      try {
        const ws = new WebSocket(fullUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          if (!current(ws)) return;
          lastReceived = Date.now();
          probeAt = null;
          networkInterrupted = false;
          const sendNow = (data: any) => {
            if (!current(ws) || ws.readyState !== WebSocket.OPEN) return;
            try {
              ws.send(JSON.stringify(data));
            } catch {
              fail();
            }
          };
          for (const message of pendingMessages.current.splice(0)) sendNow(message);
          // Each business restores its subscriptions/current activity here.
          if (current(ws)) handlersRef.current.onOpen?.(sendNow);
        };
        ws.onmessage = (event) => {
          if (!current(ws)) return;
          // Heartbeats and non-JSON frames are also evidence of a live connection.
          lastReceived = Date.now();
          probeAt = null;
          if (event.data === 'ping') {
            try {
              ws.send('pong');
            } catch {
              fail();
            }
            return;
          }
          if (event.data === 'pong') return;
          let data: any;
          try {
            data = JSON.parse(event.data);
          } catch {
            return;
          }
          handlersRef.current.onMessage?.(data);
        };
        ws.onclose = (event) => { if (current(ws)) fail(event); };
        ws.onerror = (event) => {
          if (!current(ws)) return;
          try {
            handlersRef.current.onError?.(event);
          } finally {
            fail();
          }
        };
      } catch {
        fail();
      }
    };
    const probe = (socket: WebSocket, now: number) => {
      probeAt = now;
      try {
        socket.send('ping');
      } catch {
        fail();
      }
    };
    const check = (resumed = false) => {
      if (disposed || stopped) return;
      const now = Date.now();
      if (now < lastCheck) {
        // A system clock correction must not postpone detection for hours.
        lastReceived = now;
        connectingAt = now;
        if (probeAt !== null) probeAt = now;
      }
      // A delayed timer after sleep must grant a new probe window, not immediately expire it.
      const delayed = now - lastCheck > 30_000;
      lastCheck = now;
      const socket = wsRef.current;
      if (!socket) {
        if (resumed && autoReconnect) {
          clearTimeout(reconnectTimer);
          reconnectTimer = undefined;
          connect();
        }
        return;
      }
      if (socket.readyState === WebSocket.CONNECTING) {
        if (now - connectingAt >= openTimeout) fail();
        return;
      }
      if (socket.readyState !== WebSocket.OPEN) {
        fail();
        return;
      }
      if (probeAt !== null) {
        if (delayed) probe(socket, now);
        else if (now - probeAt >= probeTimeout) fail();
      } else if (now - lastReceived >= idleTimeout || (resumed && networkInterrupted)) {
        probe(socket, now);
      }
      if (resumed) networkInterrupted = false;
    };
    const resume = () => check(true);
    const visible = () => { if (page.visibilityState === 'visible') resume(); };
    // Network status is only a hint; it is not proof that the OJ is reachable.
    const offline = () => { networkInterrupted = true; };
    recoverRef.current = fail;
    window.addEventListener('online', resume);
    window.addEventListener('offline', offline);
    window.addEventListener('focus', resume);
    window.addEventListener('pageshow', resume);
    page.addEventListener('visibilitychange', visible);
    watchdog = window.setInterval(() => check(), Math.max(1000, Math.min(10_000, probeTimeout)));
    connect();
    return () => {
      disposed = true;
      canQueue.current = false;
      clearTimeout(reconnectTimer);
      window.clearInterval(watchdog);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', offline);
      window.removeEventListener('focus', resume);
      window.removeEventListener('pageshow', resume);
      page.removeEventListener('visibilitychange', visible);
      recoverRef.current = () => {};
      // Never carry queued operations into another connection context.
      pendingMessages.current = [];
      retire();
    };
  }, [enabled, autoReconnect, reconnectInterval, heartbeatTimeout, heartbeatProbeTimeout, connectionTimeout, ui.ws_prefix, url, domainId]);

  const send = useCallback((data: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(data));
      } catch {
        recoverRef.current();
      }
      return;
    }
    if (canQueue.current) pendingMessages.current.push(data);
  }, []);

  return { send, ws: wsRef };
}
