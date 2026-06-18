import { Text, Tooltip } from '@mantine/core';

interface TimeDisplayProps {
  date: string | Date | number;
  format?: 'relative' | 'absolute' | 'both';
  size?: 'xs' | 'sm' | 'md';
}

function formatRelative(date: Date): string {
  const now = Date.now();
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return date.toLocaleDateString();
}

function formatAbsolute(date: Date): string {
  return date.toLocaleString();
}

export function TimeDisplay({ date, format = 'both', size = 'xs' }: TimeDisplayProps) {
  const d = new Date(date);
  if (isNaN(d.getTime())) return <Text size={size} c="dimmed">-</Text>;

  const absolute = formatAbsolute(d);
  const relative = formatRelative(d);

  if (format === 'absolute') {
    return <Text size={size} c="dimmed">{absolute}</Text>;
  }

  return (
    <Tooltip label={absolute}>
      <Text size={size} c="dimmed" style={{ cursor: 'help' }}>
        {format === 'relative' ? relative : relative}
      </Text>
    </Tooltip>
  );
}
