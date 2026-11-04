import { Text, Tooltip } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { formatRelative } from '@/utils/datetime';

interface TimeDisplayProps {
  date: string | Date | number;
  format?: 'relative' | 'absolute' | 'both';
  size?: 'xs' | 'sm' | 'md';
}

function formatAbsolute(date: Date): string {
  return date.toLocaleString();
}

export function TimeDisplay({ date, format = 'both', size = 'xs' }: TimeDisplayProps) {
  const { t } = useI18n();
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return <Text component="span" size={size} c="dimmed" className="hydro-numeric">-</Text>;

  const absolute = formatAbsolute(d);
  const relative = formatRelative(d, t);

  if (format === 'absolute') {
    return <Text component="span" size={size} c="dimmed" className="hydro-numeric">{absolute}</Text>;
  }

  return (
    <Tooltip label={absolute}>
      <Text component="span" size={size} c="dimmed" className="hydro-numeric" style={{ cursor: 'help' }}>
        {relative}
      </Text>
    </Tooltip>
  );
}
