import { useState, useEffect, useMemo, useRef } from 'react';
import { Paper, Group, Button, Slider, Text, Stack, Badge, Select } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { CodeEditor } from '@/components/editor/code-editor';

interface ReplayChange {
  rangeOffset: number;
  rangeLength: number;
  text: string;
}

interface ReplayEvent {
  type?: 'insert' | 'delete' | 'replace';
  position?: number;
  text?: string;
  length?: number;
  timestamp?: number;
  t?: number;
  lang?: string;
  changes?: ReplayChange[];
}

interface ReplaySnapshot {
  t: number;
  code: string;
  lang?: string;
}

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

function applyEvent(code: string, event: ReplayEvent) {
  if (event.changes?.length) {
    let next = code;
    for (const change of [...event.changes].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
      const pos = Math.max(0, Math.min(change.rangeOffset, next.length));
      const len = Math.max(0, change.rangeLength || 0);
      next = next.slice(0, pos) + (change.text || '') + next.slice(pos + len);
    }
    return next;
  }

  const pos = Math.max(0, Math.min(event.position || 0, code.length));
  if (event.type === 'insert') return code.slice(0, pos) + (event.text || '') + code.slice(pos);
  if (event.type === 'delete') return code.slice(0, pos) + code.slice(pos + (event.length || 1));
  if (event.type === 'replace') return code.slice(0, pos) + (event.text || '') + code.slice(pos + (event.length || 0));
  return code;
}

function eventTime(event: ReplayEvent) {
  return Number(event.t ?? event.timestamp ?? 0) || 0;
}

function formatReplayTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

function buildStates(events: ReplayEvent[], snapshots: ReplaySnapshot[], initialCode: string, finalCode?: string) {
  const sortedEvents = [...events].sort((a, b) => eventTime(a) - eventTime(b));
  const sortedSnapshots = [...snapshots].sort((a, b) => a.t - b.t);
  const states = [initialCode];
  let currentCode = initialCode;
  let snapshotIndex = 0;

  for (const event of sortedEvents) {
    while (snapshotIndex < sortedSnapshots.length && sortedSnapshots[snapshotIndex].t <= eventTime(event)) {
      currentCode = sortedSnapshots[snapshotIndex].code;
      snapshotIndex++;
    }
    currentCode = applyEvent(currentCode, event);
    states.push(currentCode);
  }
  if (typeof finalCode === 'string' && finalCode !== states[states.length - 1]) states.push(finalCode);
  return { states, events: sortedEvents };
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
  const events = replay?.events || eventsProp || [];
  const snapshots = replay?.snapshots || snapshotsProp || [];
  const initialCode = replay?.initialCode ?? initialCodeProp;
  const finalCode = replay?.finalCode ?? finalCodeProp;
  const replayLanguage = replay?.lang || language;
  const { states, events: sortedEvents } = useMemo(
    () => buildStates(events, snapshots, initialCode, finalCode),
    [events, snapshots, initialCode, finalCode],
  );
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState('1');
  const timerRef = useRef<number | null>(null);

  const maxIndex = Math.max(0, states.length - 1);
  const code = states[currentIndex] || '';
  const duration = sortedEvents.length ? eventTime(sortedEvents[sortedEvents.length - 1]) : 0;
  const timeAt = (index: number) => {
    if (index <= 0) return 0;
    return sortedEvents[index - 1] ? eventTime(sortedEvents[index - 1]) : duration;
  };

  const stop = () => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  };

  useEffect(() => {
    if (!playing) return undefined;
    if (currentIndex >= maxIndex) {
      setPlaying(false);
      return undefined;
    }
    const delay = Math.max(20, (timeAt(currentIndex + 1) - timeAt(currentIndex)) / Number(speed || 1));
    timerRef.current = window.setTimeout(() => {
      setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
    }, delay);
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [playing, currentIndex, maxIndex, speed]);

  useEffect(() => {
    setCurrentIndex(0);
    setPlaying(false);
  }, [states]);

  const handleReset = () => {
    stop();
    setCurrentIndex(0);
  };

  const handleSliderChange = (value: number) => {
    stop();
    setCurrentIndex(value);
  };

  const handlePlay = () => {
    if (playing) {
      stop();
      return;
    }
    if (currentIndex >= maxIndex) setCurrentIndex(0);
    else setCurrentIndex((prev) => Math.min(maxIndex, prev + 1));
    setPlaying(true);
  };

  return (
    <Paper withBorder>
      <Stack gap={0}>
        <Group justify="space-between" p="xs" className="border-b border-[var(--hydro-border)]">
          <Group gap="xs">
            <Button size="xs" onClick={handlePlay}>
              {playing ? t('Pause') : t('Play')}
            </Button>
            <Button size="xs" variant="light" onClick={handleReset}>
              {t('Restart')}
            </Button>
            <Button size="xs" variant="light" onClick={() => { stop(); setCurrentIndex((prev) => Math.max(0, prev - 1)); }}>
              {t('Previous Step')}
            </Button>
            <Button size="xs" variant="light" onClick={() => { stop(); setCurrentIndex((prev) => Math.min(maxIndex, prev + 1)); }}>
              {t('Next Step')}
            </Button>
            <Badge size="xs">{currentIndex}/{maxIndex}</Badge>
            <Text size="xs" c="dimmed">{formatReplayTime(timeAt(currentIndex))} / {formatReplayTime(duration)}</Text>
          </Group>
          <Slider
            value={currentIndex}
            onChange={handleSliderChange}
            min={0}
            max={maxIndex}
            step={1}
            style={{ flex: 1 }}
            size="sm"
            mx="md"
          />
          <Select
            value={speed}
            onChange={(value) => setSpeed(value || '1')}
            data={['0.5', '1', '2', '4'].map((value) => ({ value, label: `${value}x` }))}
            size="xs"
            w={84}
          />
        </Group>
        <CodeEditor value={code} readOnly language={replayLanguage} height={400} />
      </Stack>
    </Paper>
  );
}
