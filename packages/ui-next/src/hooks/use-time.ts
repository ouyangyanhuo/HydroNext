import { useEffect, useState } from 'react';

const MAX_TIMEOUT = 2_147_000_000;

function timestampOf(value?: string | number | Date | null) {
  if (value == null || value === '') return Number.NaN;
  const timestamp = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : Number.NaN;
}

export function useDeadlinePassed(value?: string | number | Date | null) {
  const deadline = timestampOf(value);
  const [passed, setPassed] = useState(() => Number.isFinite(deadline) && deadline <= Date.now());

  useEffect(() => {
    let timer: number | undefined;
    const update = () => {
      if (!Number.isFinite(deadline)) {
        setPassed(false);
        return;
      }
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        setPassed(true);
        return;
      }
      setPassed(false);
      timer = window.setTimeout(update, Math.min(remaining + 20, MAX_TIMEOUT));
    };
    timer = window.setTimeout(update, 0);
    return () => window.clearTimeout(timer);
  }, [deadline]);

  return passed;
}

export function useCurrentTime(refreshInterval = 60_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), refreshInterval);
    return () => window.clearInterval(timer);
  }, [refreshInterval]);
  return now;
}
