import { useEffect, useRef, useState } from 'react';
import { useWebSocket } from './use-websocket';

export function useContestActivity(tid: string, pid: number, enabled: boolean) {
  const context = `${tid}/${pid}`;
  const [time, setTime] = useState<{ context: string, elapsed: number, at: number, active: boolean } | null>(null);
  const connected = useRef(false);
  const active = () => document.visibilityState === 'visible' && document.hasFocus();
  const { send } = useWebSocket({
    url: `contest/${encodeURIComponent(tid)}/activity-conn?pid=${pid}`,
    enabled,
    onOpen: (sendNow) => {
      connected.current = true;
      sendNow({ active: active() });
    },
    onClose: () => { connected.current = false; },
    onMessage: (data) => {
      if (Number.isFinite(data.elapsed) && data.elapsed >= 0) {
        setTime({ context, elapsed: data.elapsed, at: Date.now(), active: active() });
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
  }, [enabled, tid, pid, send]);
  return enabled && time?.context === context ? time : null;
}
