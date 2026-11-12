import { Badge } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { getStatusTone, judgeBadgeStyle, STATUS_TEXTS } from './status-map';

interface RecordStatusBadgeProps {
  status?: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  equalWidth?: boolean;
  className?: string;
}

export function RecordStatusBadge({
  status,
  size = 'sm',
  equalWidth = false,
  className,
}: RecordStatusBadgeProps) {
  const { t } = useI18n();
  const label = status == null ? 'Unknown' : STATUS_TEXTS[status] || `Unknown(${status})`;
  const text = t(label);

  return (
    <Badge
      size={size}
      variant="light"
      style={judgeBadgeStyle(getStatusTone(status))}
      title={text}
      className={[
        'hydro-record-status-badge',
        equalWidth ? 'hydro-record-status-badge--equal-width' : '',
        className,
      ].filter(Boolean).join(' ')}
    >
      {text}
    </Badge>
  );
}
