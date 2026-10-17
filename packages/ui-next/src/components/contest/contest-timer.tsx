import { Badge, Group, Text } from '@mantine/core';
import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { formatContestClock } from '@/utils/contest-problem-time';

interface ContestTimerProps {
  beginAt: string | Date;
  endAt: string | Date;
  onStatusChange?: (status: 'upcoming' | 'running' | 'finished') => void;
}

export function ContestTimer({ beginAt, endAt, onStatusChange }: ContestTimerProps) {
  const { t } = useI18n();
  const [mountedAt] = useState(() => Date.now());
  const [now, setNow] = useState(mountedAt);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const begin = new Date(beginAt).getTime();
  const end = new Date(endAt).getTime();
  // Reserve the longest initial clock, including contests lasting 100+ hours.
  const clockWidth = `${formatContestClock(Math.max(begin - mountedAt, end - begin, 0)).length}ch`;
  const isRunning = now >= begin && now < end;
  const isUpcoming = now < begin;
  const isFinished = now >= end;

  useEffect(() => {
    if (isFinished) onStatusChange?.('finished');
    else if (isRunning) onStatusChange?.('running');
    else onStatusChange?.('upcoming');
  }, [isFinished, isRunning, onStatusChange]);

  return (
    <Group gap="md">
      <Badge size="lg" variant="light" color={isRunning ? 'green' : isUpcoming ? 'blue' : 'gray'}>
        {isRunning ? t('Running') : isUpcoming ? t('Upcoming') : t('Finished')}
      </Badge>
      {isRunning && (
        <Text size="lg" fw={700} ff="monospace" c="green" className="hydro-clock" style={{ minInlineSize: clockWidth }} role="timer" aria-live="off">
          {formatContestClock(end - now)}
        </Text>
      )}
      {isUpcoming && (
        <Text size="lg" fw={700} ff="monospace" c="blue" className="hydro-clock" style={{ minInlineSize: clockWidth }} role="timer" aria-live="off">
          {formatContestClock(begin - now)}
        </Text>
      )}
    </Group>
  );
}
