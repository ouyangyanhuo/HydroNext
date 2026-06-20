import { Text, Tooltip } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';

interface TimeDisplayProps {
  date: string | Date | number;
  format?: 'relative' | 'absolute' | 'both';
  size?: 'xs' | 'sm' | 'md';
}

function formatRelative(date: Date, t: (key: string) => string): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return t('just now');
  if (minutes < 60) return t('{0}m ago').replace('{0}', String(minutes));
  if (hours < 24) return t('{0}h ago').replace('{0}', String(hours));
  if (days < 30) return t('{0}d ago').replace('{0}', String(days));
  return date.toLocaleDateString();
}

function formatAbsolute(date: Date): string {
  return date.toLocaleString();
}

export function TimeDisplay({ date, format = 'both', size = 'xs' }: TimeDisplayProps) {
  const { t } = useI18n();
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return <Text component="span" size={size} c="dimmed">-</Text>;

  const absolute = formatAbsolute(d);
  const relative = formatRelative(d, t);

  if (format === 'absolute') {
    return <Text component="span" size={size} c="dimmed">{absolute}</Text>;
  }

  return (
    <Tooltip label={absolute}>
      <Text component="span" size={size} c="dimmed" style={{ cursor: 'help' }}>
        {format === 'relative' ? relative : relative}
      </Text>
    </Tooltip>
  );
}
