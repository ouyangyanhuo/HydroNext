import { Portal, Tooltip } from '@mantine/core';
import { IconGripVertical, IconTrophy } from '@tabler/icons-react';
import { useCallback, useEffect, useState } from 'react';
import { ButtonBase } from '@/components/common/button';
import { Link } from '@/components/link';
import { useContestActivity } from '@/hooks/use-contest-activity';
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

export function ContestProblemTimer({ storageKey, tid, title, beginAt, endAt, pid, recordTime = false }: {
  storageKey: string;
  tid: string;
  title: string;
  beginAt: number;
  endAt: number;
  pid: number;
  recordTime?: boolean;
}) {
  const { t } = useI18n();
  const [mountedAt] = useState(() => Date.now());
  const [clock, setClock] = useState(() => ({ now: mountedAt, elapsed: readElapsed(storageKey) }));
  const clockWidth = `${formatContestClock(Math.max(beginAt - mountedAt, endAt - beginAt, 0)).length}ch`;
  const activity = useContestActivity(tid, pid, recordTime);
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
  const timingUnsynced = recordTime && !activity?.synced;
  const elapsed = activity
    ? activity.elapsed + (activity.active ? Math.max(0, Math.min(clock.now, endAt) - Math.max(activity.at, beginAt)) : 0)
    : clock.elapsed;

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
          <span className="hydro-contest-problem-timer__value hydro-clock" style={{ minInlineSize: clockWidth }} role="timer" aria-live="off">
            {formatContestClock(Math.ceil(remaining / 1000) * 1000)}
          </span>
        </div>
        <Tooltip
          label={t(timingUnsynced ? 'Problem time is not syncing. Only server-confirmed time counts toward the scoreboard.'
            : recordTime ? 'Foreground problem time; saved to the contest scoreboard.' : 'Visible time on this problem; saved in this tab.')}
          withArrow
          multiline
          w={300}
          maw="calc(100vw - 32px)"
          withinPortal
          zIndex={200}
          events={{ hover: true, focus: true, touch: true }}
        >
          <div className="hydro-contest-problem-timer__metric" tabIndex={0}>
            <span className="hydro-contest-problem-timer__label" style={timingUnsynced ? { color: 'var(--hydro-warning)' } : undefined}>
              {t(timingUnsynced ? 'Timing not synced' : 'Time on this problem')}
            </span>
            <span className="hydro-contest-problem-timer__value hydro-clock" style={{ minInlineSize: clockWidth }} role="timer" aria-live="off">
              {timingUnsynced ? '—' : formatContestClock(elapsed)}
            </span>
          </div>
        </Tooltip>
      </div>
    </Portal>
  );
}
