import { Portal } from '@mantine/core';
import { IconGripVertical, IconTrophy } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { ButtonBase } from '@/components/common/button';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';
import { createProblemTimeTracker, formatContestClock } from '@/utils/contest-problem-time';
import { bindFloatingDrag, CONTEST_TIMER_POSITION_KEY } from '@/utils/floating-position';

function readElapsed(key: string) {
  try {
    const elapsed = Number(window.sessionStorage.getItem(key));
    return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : 0;
  } catch {
    return 0;
  }
}

export function ContestProblemTimer({ storageKey, tid, title, beginAt, endAt }: {
  storageKey: string;
  tid: string;
  title: string;
  beginAt: number;
  endAt: number;
}) {
  const { t } = useI18n();
  const [clock, setClock] = useState(() => ({ now: Date.now(), elapsed: readElapsed(storageKey) }));
  const floatingRef = useCallback((element: HTMLDivElement | null) => {
    if (!element) return undefined;
    const handle = element.querySelector<HTMLElement>('[data-timer-drag-handle]');
    return handle ? bindFloatingDrag(element, handle, CONTEST_TIMER_POSITION_KEY) : undefined;
  }, []);

  useEffect(() => {
    const tracker = createProblemTimeTracker({
      beginAt,
      endAt,
      now: Date.now(),
      elapsed: readElapsed(storageKey),
      visible: document.visibilityState === 'visible',
    });
    let interval: number | undefined;
    let lastSaved = 0;
    const save = (elapsed: number) => {
      try {
        window.sessionStorage.setItem(storageKey, String(elapsed));
      } catch {
        // The clock still works when browser storage is unavailable.
      }
    };
    const update = (persist = false) => {
      const now = Date.now();
      const elapsed = tracker.tick(now);
      setClock({ now, elapsed });
      if (persist || now - lastSaved >= 10_000) {
        save(elapsed);
        lastSaved = now;
      }
      if (now >= endAt) window.clearInterval(interval);
    };
    const resume = () => {
      window.clearInterval(interval);
      tracker.setVisible(document.visibilityState === 'visible', Date.now());
      update(true);
      if (document.visibilityState === 'visible' && Date.now() < endAt) {
        interval = window.setInterval(update, 1000);
      }
    };
    const pause = () => {
      window.clearInterval(interval);
      save(tracker.setVisible(false, Date.now()));
    };
    resume();
    document.addEventListener('visibilitychange', resume);
    window.addEventListener('pagehide', pause);
    window.addEventListener('pageshow', resume);
    return () => {
      pause();
      document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('pagehide', pause);
      window.removeEventListener('pageshow', resume);
    };
  }, [storageKey, beginAt, endAt]);

  const upcoming = clock.now < beginAt;
  const ended = clock.now >= endAt;
  const remaining = Math.max(0, (upcoming ? beginAt : endAt) - clock.now);
  const urgent = !upcoming && !ended && remaining <= 5 * 60_000;

  return (
    <Portal>
      <div ref={floatingRef} className="hydro-contest-problem-timer" role="group" aria-label={`${t('Contest')}: ${title}`}>
        <ButtonBase
          type="button"
          data-timer-drag-handle
          className="hydro-contest-problem-timer__drag"
          title={t('Drag timer; use arrow keys to move, or Home to reset.')}
          aria-label={t('Drag timer; use arrow keys to move, or Home to reset.')}
        >
          <IconGripVertical size={18} aria-hidden="true" />
        </ButtonBase>
        <Link
          to="contest_detail"
          params={{ tid }}
          className="hydro-contest-problem-timer__contest"
          title={title}
          aria-label={`${t('Contest')}: ${title}`}
        >
          <IconTrophy size={21} stroke={1.7} aria-hidden="true" />
        </Link>
        <div className={`hydro-contest-problem-timer__metric${urgent ? ' hydro-contest-problem-timer__metric--urgent' : ''}`}>
          <span className="hydro-contest-problem-timer__label">
            {ended ? t('Finished') : t(upcoming ? 'Contest starts in' : 'Contest time remaining')}
          </span>
          <span className="hydro-contest-problem-timer__value" role="timer" aria-live="off">
            {formatContestClock(Math.ceil(remaining / 1000) * 1000)}
          </span>
        </div>
        <div className="hydro-contest-problem-timer__metric" title={t('Visible time on this problem; saved in this tab.')}>
          <span className="hydro-contest-problem-timer__label">{t('Time on this problem')}</span>
          <span className="hydro-contest-problem-timer__value" role="timer" aria-live="off">
            {formatContestClock(clock.elapsed)}
          </span>
        </div>
      </div>
    </Portal>
  );
}
