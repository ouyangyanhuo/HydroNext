import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/stores/session';
import { useWebSocket } from './use-websocket';

export function useContestActivity(tid: string, pid: number, enabled: boolean) {
  const domainId = useSessionStore((s) => s.ui.domainId);
  const context = `${domainId}/${tid}/${pid}`;
  const [time, setTime] = useState<{ context: string, elapsed: number, at: number, active: boolean, synced: boolean } | null>(null);
  const connected = useRef(false);
  const active = () => document.visibilityState === 'visible' && document.hasFocus();
  const unsynced = () => {
    const at = Date.now();
    setTime((previous) => ({
      context, elapsed: previous?.context === context ? previous.elapsed : 0, at, active: false, synced: false,
    }));
  };
  const { send } = useWebSocket({
    url: `contest/${encodeURIComponent(tid)}/activity-conn?pid=${pid}`,
    domainId,
    enabled,
    onOpen: (sendNow) => {
      connected.current = true;
      unsynced();
      sendNow({ active: active() });
    },
    onClose: () => { connected.current = false; unsynced(); },
    onMessage: (data) => {
      if (!data || typeof data !== 'object') return;
      if (data?.error) {
        unsynced();
        return;
      }
      if (Number.isFinite(data.elapsed) && data.elapsed >= 0) {
        setTime({ context, elapsed: data.elapsed, at: Date.now(), active: active(), synced: true });
      }
    },
  });

  useEffect(() => {
    if (!enabled) return undefined;
    const update = () => { if (connected.current) send({ active: active() }); };
    const pause = () => { if (connected.current) send({ active: false }); };
    const interval = window.setInterval(update, 10_000);
    document.addEventListener('visibilitychange', update);
    window.addEventListener('focus', update);
    window.addEventListener('blur', update);
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', update);
    return () => {
      pause();
      connected.current = false;
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', update);
      window.removeEventListener('focus', update);
      window.removeEventListener('blur', update);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('pageshow', update);
    };
  }, [enabled, domainId, tid, pid, send]);
  return enabled && time?.context === context ? time : null;
}
