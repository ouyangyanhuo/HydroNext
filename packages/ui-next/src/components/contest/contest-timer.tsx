import { useState, useEffect } from 'react';
import { Text, Group, Badge } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';

interface ContestTimerProps {
  beginAt: string | Date;
  endAt: string | Date;
  onStatusChange?: (status: 'upcoming' | 'running' | 'finished') => void;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0:00';
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function ContestTimer({ beginAt, endAt, onStatusChange }: ContestTimerProps) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const begin = new Date(beginAt).getTime();
  const end = new Date(endAt).getTime();
  const isRunning = now >= begin && now < end;
  const isUpcoming = now < begin;
  const isFinished = now >= end;

  useEffect(() => {
    if (isFinished) onStatusChange?.('finished');
    else if (isRunning) onStatusChange?.('running');
    else onStatusChange?.('upcoming');
  }, [isFinished, isRunning]);

  return (
    <Group gap="md">
      <Badge size="lg" variant="light" color={isRunning ? 'green' : isUpcoming ? 'blue' : 'gray'}>
        {isRunning ? t('Running') : isUpcoming ? t('Upcoming') : t('Finished')}
      </Badge>
      {isRunning && (
        <Text size="lg" fw={700} ff="monospace" c="green">
          {formatDuration(end - now)}
        </Text>
      )}
      {isUpcoming && (
        <Text size="lg" fw={700} ff="monospace" c="blue">
          {formatDuration(begin - now)}
        </Text>
      )}
    </Group>
  );
}
