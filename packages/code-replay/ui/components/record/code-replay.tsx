import './code-replay.css';

import { ActionIcon, Button, ButtonBase, CodeEditor, RollingClock, ShortSelect, useI18n } from '@hydrooj/ui-next';
import { Badge, Group, Paper, Slider, Switch, Text, Tooltip } from '@mantine/core';
import {
  IconClipboardText, IconFlask, IconInfoCircle, IconPlayerPause, IconPlayerPlay, IconPlayerSkipBack, IconPlayerSkipForward,
  IconRotateClockwise, IconSend, IconTemplate,
} from '@tabler/icons-react';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { buildReplayStates, eventTime, type ReplayAction, type ReplayEvent, type ReplaySnapshot } from '../../../replay';
import {
  advanceReplayTime, buildThinkingRanges, replayIndexAtTime, THINKING_THRESHOLD_MS, thinkingRangeAt,
} from '../../../timeline';

export interface CodeReplayProps {
  events?: ReplayEvent[];
  snapshots?: ReplaySnapshot[];
  initialCode?: string;
  finalCode?: string;
  language?: string;
  replay?: {
    events?: ReplayEvent[];
    snapshots?: ReplaySnapshot[];
    initialCode?: string;
    finalCode?: string;
    lang?: string;
  };
}

const EMPTY_EVENTS: ReplayEvent[] = [];
const EMPTY_SNAPSHOTS: ReplaySnapshot[] = [];
// Advancing the clock during a pause must not re-render the Monaco editor.
const ReplayEditor = memo(CodeEditor);
const ACTION_LABELS: Record<ReplayAction, string> = {
  template: 'Loaded code template', paste: 'Pasted code', self_test: 'Submitted self-test', submit: 'Submitted solution',
};
const ACTION_ICONS: Record<ReplayAction, typeof IconTemplate> = {
  template: IconTemplate, paste: IconClipboardText, self_test: IconFlask, submit: IconSend,
};

function formatReplayTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function CodeReplay({
  events: eventsProp,
  snapshots: snapshotsProp,
  initialCode: initialCodeProp = '',
  finalCode: finalCodeProp,
  language = 'cpp',
  replay,
}: CodeReplayProps) {
  const { t } = useI18n();
  const events = replay?.events || eventsProp || EMPTY_EVENTS;
  const snapshots = replay?.snapshots || snapshotsProp || EMPTY_SNAPSHOTS;
  const initialCode = replay?.initialCode ?? initialCodeProp;
  const finalCode = replay?.finalCode ?? finalCodeProp;
  const replayLanguage = replay?.lang || language;
  const { states, times, duration, events: orderedEvents } = useMemo(
    () => buildReplayStates(events, snapshots, initialCode, finalCode),
    [events, snapshots, initialCode, finalCode],
  );
  const actions = useMemo(() => orderedEvents.flatMap((event, index) => (
    event.action ? [{ event, index: index + 1 }] : []
  )), [orderedEvents]);
  const thinkingRanges = useMemo(() => buildThinkingRanges(times, duration), [times, duration]);
  const thinkingDuration = useMemo(
    () => thinkingRanges.reduce((total, range) => total + range.end - range.start, 0),
    [thinkingRanges],
  );
  const [playing, setPlaying] = useState(false);
  const [cursor, setCursor] = useState({ time: 0, index: 0 });
  const [speed, setSpeed] = useState('1');
  const [skipThinking, setSkipThinking] = useState(false);
  const timeRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const maxIndex = Math.max(0, states.length - 1);
  const isThinking = Boolean(thinkingRangeAt(thinkingRanges, cursor.time));
  // The latest action at or before the cursor, so dragging between markers still has a current entry.
  let activeAction = -1;
  while (activeAction + 1 < actions.length && actions[activeAction + 1].index <= cursor.index) activeAction++;
  const actionListRef = useRef<HTMLOListElement>(null);
  const clockStyle = useMemo(() => ({ minInlineSize: `${formatReplayTime(duration).length}ch` }), [duration]);

  const stop = () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  };

  useEffect(() => {
    if (!playing) return undefined;
    let previousTick = performance.now();
    timerRef.current = window.setInterval(() => {
      const now = performance.now();
      const elapsed = (now - previousTick) * Number(speed);
      previousTick = now;
      const time = advanceReplayTime(timeRef.current, elapsed, duration, thinkingRanges, skipThinking);
      timeRef.current = time;
      setCursor({ time, index: replayIndexAtTime(times, time) });
      if (time >= duration) setPlaying(false);
    }, 50);
    return () => {
      if (timerRef.current !== null) window.clearInterval(timerRef.current);
      timerRef.current = null;
    };
  }, [duration, playing, skipThinking, speed, thinkingRanges, times]);

  // Keep the current action visible inside the list without scrolling the page itself.
  useEffect(() => {
    const list = actionListRef.current;
    if (!list) return;
    const item = list.children[activeAction] as HTMLElement | undefined;
    if (!item) {
      list.scrollTop = 0;
      return;
    }
    const top = item.offsetTop;
    if (top >= list.scrollTop && top + item.offsetHeight <= list.scrollTop + list.clientHeight) return;
    list.scrollTop = top - (list.clientHeight - item.offsetHeight) / 2;
  }, [activeAction]);

  const seek = (time: number, index = replayIndexAtTime(times, time)) => {
    stop();
    timeRef.current = time;
    setCursor({ time, index });
  };

  const handlePlay = () => {
    if (playing) {
      stop();
      return;
    }
    if (duration === 0) {
      seek(0, maxIndex);
      return;
    }
    if (cursor.time >= duration) {
      timeRef.current = 0;
      setCursor({ time: 0, index: 0 });
    }
    setPlaying(true);
  };

  const step = (offset: number) => {
    const index = Math.max(0, Math.min(maxIndex, cursor.index + offset));
    seek(times[index], index);
  };

  const thinkingSegments = useMemo(() => thinkingRanges.map((range) => (
    <span
      key={range.start}
      className="hydro-code-replay__thinking"
      style={{ left: `${range.start / duration * 100}%`, width: `${(range.end - range.start) / duration * 100}%` }}
    />
  )), [duration, thinkingRanges]);

  return (
    <Paper withBorder className="hydro-content-card hydro-code-replay">
      <div className="hydro-code-replay__controls">
        <div className="hydro-code-replay__toolbar">
          <Group gap={8} wrap="nowrap" className="hydro-code-replay__transport">
            <Button
              size="sm"
              className="hydro-code-replay__play"
              leftSection={playing ? <IconPlayerPause size={16} /> : <IconPlayerPlay size={16} />}
              onClick={handlePlay}
              disabled={duration === 0 && maxIndex === 0}
            >
              {playing ? t('Pause') : t('Play')}
            </Button>
            <Tooltip label={t('Previous Step')} withArrow>
              <ActionIcon size={36} variant="default" aria-label={t('Previous Step')} disabled={cursor.index === 0} onClick={() => step(-1)}>
                <IconPlayerSkipBack size={17} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('Next Step')} withArrow>
              <ActionIcon size={36} variant="default" aria-label={t('Next Step')} disabled={cursor.index === maxIndex} onClick={() => step(1)}>
                <IconPlayerSkipForward size={17} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t('Restart')} withArrow>
              <ActionIcon size={36} variant="subtle" color="gray" aria-label={t('Restart')} onClick={() => seek(0, 0)}>
                <IconRotateClockwise size={17} />
              </ActionIcon>
            </Tooltip>
          </Group>
          <div className="hydro-code-replay__time">
            <Text component="span" size="sm" className="hydro-code-replay__clock">
              <RollingClock
                value={formatReplayTime(cursor.time)}
                seconds={Math.floor(cursor.time / 1000)}
                animate={playing && Number(speed) <= 1}
                style={clockStyle}
              />
              <span className="hydro-code-replay__total"> / {formatReplayTime(duration)}</span>
            </Text>
            {isThinking && <Badge size="sm" variant="light" color="gray">{t('Thinking time')}</Badge>}
          </div>
          <div className="hydro-code-replay__preferences">
            <Group gap={8} wrap="nowrap">
              <Text size="xs" c="dimmed">{t('Speed')}</Text>
              <ShortSelect
                aria-label={t('Speed')}
                value={speed}
                onChange={(value) => setSpeed(value || '1')}
                data={['0.5', '1', '2', '4'].map((value) => ({ value, label: `${value}x` }))}
                size="sm"
                w={80}
                allowDeselect={false}
              />
            </Group>
            <Switch
              size="sm"
              checked={skipThinking}
              onChange={(event) => setSkipThinking(event.currentTarget.checked)}
              label={t('Skip thinking time')}
            />
          </div>
        </div>

        <div className="hydro-code-replay__timeline">
          <div aria-hidden="true" className="hydro-code-replay__track">
            {thinkingSegments}
          </div>
          <Slider
            aria-label={t('Replay timeline')}
            value={cursor.time}
            onChange={(time) => seek(time)}
            min={0}
            max={Math.max(1, duration)}
            disabled={duration === 0}
            step={1}
            size={10}
            label={(time) => formatReplayTime(time) + (thinkingRangeAt(thinkingRanges, time) ? ` · ${t('Thinking time')}` : '')}
            styles={{
              root: { position: 'relative', paddingInline: 0 },
              track: { background: 'transparent', '--slider-track-bg': 'transparent' },
              bar: { background: 'transparent' },
              thumb: { borderColor: 'var(--mantine-primary-color-filled)' },
            }}
          />
          {duration > 0 && actions.map(({ event, index }, position) => (
            <Tooltip key={event.seq ?? index} label={`${formatReplayTime(eventTime(event))} · ${t(ACTION_LABELS[event.action!])}`} withArrow>
              <ButtonBase
                className="hydro-code-replay__marker"
                data-kind={event.action}
                data-active={position === activeAction || undefined}
                style={{ left: `${eventTime(event) / duration * 100}%` }}
                aria-label={`${t(ACTION_LABELS[event.action!])} · ${formatReplayTime(eventTime(event))}`}
                onClick={() => seek(times[index], index)}
              />
            </Tooltip>
          ))}
        </div>

        <div className="hydro-code-replay__statusbar">
          <Group gap="md" className="hydro-code-replay__legend">
            <Group gap={5}>
              <span aria-hidden="true" className="hydro-code-replay__swatch" />
              <Text size="xs" c="dimmed">{t('Editing')}</Text>
            </Group>
            <Group gap={5} wrap="nowrap">
              <span aria-hidden="true" className="hydro-code-replay__swatch hydro-code-replay__swatch--idle" />
              <Text size="xs" c="dimmed">{t('Thinking time')} · {formatReplayTime(thinkingDuration)}</Text>
              <Tooltip
                label={t('Pauses of at least {0} seconds are shown as thinking time.', THINKING_THRESHOLD_MS / 1000)}
                multiline
                w={250}
                withArrow
                events={{ hover: true, focus: true, touch: true }}
              >
                <ActionIcon
                  size={24}
                  variant="subtle"
                  color="gray"
                  aria-label={t('Pauses of at least {0} seconds are shown as thinking time.', THINKING_THRESHOLD_MS / 1000)}
                >
                  <IconInfoCircle size={15} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>
          <Text size="xs" c="dimmed" className="hydro-code-replay__event-count">
            {t('Events')} <span>{cursor.index} / {maxIndex}</span>
          </Text>
        </div>
      </div>

      <div className="hydro-code-replay__body" data-has-actions={actions.length > 0 || undefined}>
        <div className="hydro-code-replay__editor">
          <ReplayEditor value={states[cursor.index] || ''} readOnly language={replayLanguage} height="100%" />
        </div>
        {actions.length > 0 && (
          <section className="hydro-code-replay__log" aria-label={t('Recorded actions')}>
            <header className="hydro-code-replay__log-header">
              <Text size="sm" fw={600}>{t('Recorded actions')}</Text>
              <Text size="xs" c="dimmed" className="hydro-code-replay__log-count">
                {activeAction + 1} / {actions.length}
              </Text>
            </header>
            <ol ref={actionListRef} className="hydro-code-replay__actions">
              {actions.map(({ event, index }, position) => {
                const ActionIconComponent = ACTION_ICONS[event.action!];
                const wallTime = event.timestamp !== undefined && Number.isFinite(new Date(event.timestamp).getTime())
                  ? new Date(event.timestamp) : null;
                const details = [
                  event.lang,
                  event.action === 'paste' && event.characters !== undefined ? t('{0} characters', event.characters) : '',
                ].filter(Boolean).join(' · ');
                return (
                  <li key={event.seq ?? index}>
                    <ButtonBase
                      className="hydro-code-replay__action"
                      data-kind={event.action}
                      data-state={position === activeAction ? 'current' : position < activeAction ? 'past' : 'future'}
                      aria-current={position === activeAction ? 'step' : undefined}
                      onClick={() => seek(times[index], index)}
                    >
                      <span className="hydro-code-replay__action-icon" aria-hidden="true">
                        <ActionIconComponent size={15} stroke={1.8} />
                      </span>
                      <span className="hydro-code-replay__action-main">
                        <span className="hydro-code-replay__action-label">{t(ACTION_LABELS[event.action!])}</span>
                        {details && <span className="hydro-code-replay__action-detail">{details}</span>}
                      </span>
                      <span className="hydro-code-replay__action-times">
                        <span className="hydro-code-replay__action-time">{formatReplayTime(eventTime(event))}</span>
                        {wallTime && (
                          <time className="hydro-code-replay__action-wall-time" dateTime={wallTime.toISOString()}>
                            {wallTime.toLocaleTimeString()}
                          </time>
                        )}
                      </span>
                    </ButtonBase>
                  </li>
                );
              })}
            </ol>
          </section>
        )}
      </div>
    </Paper>
  );
}
