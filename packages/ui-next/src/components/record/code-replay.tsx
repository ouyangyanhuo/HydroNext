import { buildReplayStates, type ReplayEvent, type ReplaySnapshot } from '@hydrooj/code-replay/replay';
import { Badge, Button, Group, Paper, Select, Slider, Stack, Text } from '@mantine/core';
import { useEffect, useMemo, useRef, useState } from 'react';
import { CodeEditor } from '@/components/editor/code-editor';
import { useI18n } from '@/hooks/use-i18n';

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

function formatReplayTime(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
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
  const { states, times } = useMemo(
    () => buildReplayStates(events, snapshots, initialCode, finalCode),
    [events, snapshots, initialCode, finalCode],
  );
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState('1');
  const timerRef = useRef<number | null>(null);

  const maxIndex = Math.max(0, states.length - 1);
  const code = states[currentIndex] || '';
  const duration = times[times.length - 1];
  const stop = () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setPlaying(false);
  };

  useEffect(() => {
    if (!playing || currentIndex >= maxIndex) return undefined;
    const delay = Math.max(20, (
      times[currentIndex + 1]
      - (times[currentIndex] || 0)
    ) / Number(speed || 1));
    timerRef.current = window.setTimeout(() => {
      const nextIndex = Math.min(maxIndex, currentIndex + 1);
      setCurrentIndex(nextIndex);
      if (nextIndex >= maxIndex) setPlaying(false);
    }, delay);
    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      timerRef.current = null;
    };
  }, [currentIndex, duration, maxIndex, playing, times, speed]);

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
    if (maxIndex === 0) return;
    if (currentIndex >= maxIndex) {
      setCurrentIndex(0);
      setPlaying(true);
      return;
    }
    const nextIndex = Math.min(maxIndex, currentIndex + 1);
    setCurrentIndex(nextIndex);
    setPlaying(nextIndex < maxIndex);
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
            <Text size="xs" c="dimmed">
              {formatReplayTime((times[currentIndex] || 0))} / {formatReplayTime(duration)}
            </Text>
          </Group>
          <Slider
            value={currentIndex}
            onChange={handleSliderChange}
            min={0}
            max={Math.max(1, maxIndex)}
            disabled={maxIndex === 0}
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
