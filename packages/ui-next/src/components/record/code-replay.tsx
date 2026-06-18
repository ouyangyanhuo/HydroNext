import { useState, useEffect, useRef } from 'react';
import { Paper, Group, Button, Slider, Text, Stack, Badge } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { CodeEditor } from '@/components/editor/code-editor';

interface CodeReplayProps {
  events: Array<{
    type: 'insert' | 'delete' | 'replace';
    position: number;
    text?: string;
    length?: number;
    timestamp: number;
  }>;
  initialCode?: string;
  language?: string;
}

export function CodeReplay({ events, initialCode = '', language = 'cpp' }: CodeReplayProps) {
  const { t } = useI18n();
  const [playing, setPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [code, setCode] = useState(initialCode);
  const timerRef = useRef<ReturnType<typeof setInterval>>(undefined);

  const totalEvents = events.length;
  const progress = totalEvents > 0 ? (currentIndex / totalEvents) * 100 : 0;

  useEffect(() => {
    if (playing && currentIndex < totalEvents) {
      timerRef.current = setInterval(() => {
        setCurrentIndex((prev) => {
          if (prev >= totalEvents) {
            setPlaying(false);
            return prev;
          }
          const event = events[prev];
          if (event) {
            setCode((current) => {
              switch (event.type) {
                case 'insert': {
                  const pos = Math.min(event.position, current.length);
                  return current.slice(0, pos) + (event.text || '') + current.slice(pos);
                }
                case 'delete': {
                  const pos = Math.min(event.position, current.length);
                  const len = event.length || 1;
                  return current.slice(0, pos) + current.slice(pos + len);
                }
                default: return current;
              }
            });
          }
          return prev + 1;
        });
      }, 100);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [playing, currentIndex, totalEvents, events]);

  const handleReset = () => {
    setPlaying(false);
    setCurrentIndex(0);
    setCode(initialCode);
  };

  const handleSliderChange = (value: number) => {
    const idx = Math.round((value / 100) * totalEvents);
    setCurrentIndex(idx);
    // Rebuild code up to this point
    let rebuilt = initialCode;
    for (let i = 0; i < idx; i++) {
      const event = events[i];
      if (!event) continue;
      switch (event.type) {
        case 'insert': {
          const pos = Math.min(event.position, rebuilt.length);
          rebuilt = rebuilt.slice(0, pos) + (event.text || '') + rebuilt.slice(pos);
          break;
        }
        case 'delete': {
          const pos = Math.min(event.position, rebuilt.length);
          const len = event.length || 1;
          rebuilt = rebuilt.slice(0, pos) + rebuilt.slice(pos + len);
          break;
        }
      }
    }
    setCode(rebuilt);
  };

  return (
    <Paper withBorder>
      <Stack gap={0}>
        <Group justify="space-between" p="xs" className="border-b border-[var(--hydro-border)]">
          <Group gap="xs">
            <Button size="xs" onClick={() => setPlaying(!playing)}>
              {playing ? t('Pause') : t('Play')}
            </Button>
            <Button size="xs" variant="light" onClick={handleReset}>
              {t('Reset')}
            </Button>
            <Badge size="xs">{currentIndex}/{totalEvents}</Badge>
          </Group>
          <Slider
            value={progress}
            onChange={handleSliderChange}
            style={{ flex: 1 }}
            size="sm"
            mx="md"
          />
        </Group>
        <CodeEditor value={code} readOnly language={language} height={400} />
      </Stack>
    </Paper>
  );
}
