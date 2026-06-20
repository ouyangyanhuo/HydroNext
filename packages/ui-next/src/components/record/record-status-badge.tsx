import { Badge } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { STATUS } from './status-map';

const STATUS_CONFIG: Record<number, { label: string, color: string }> = {
  [STATUS.STATUS_WAITING]: { label: 'Waiting', color: 'yellow' },
  [STATUS.STATUS_ACCEPTED]: { label: 'Accepted', color: 'green' },
  [STATUS.STATUS_WRONG_ANSWER]: { label: 'Wrong Answer', color: 'red' },
  [STATUS.STATUS_TIME_LIMIT_EXCEEDED]: { label: 'Time Limit Exceeded', color: 'orange' },
  [STATUS.STATUS_MEMORY_LIMIT_EXCEEDED]: { label: 'Memory Limit Exceeded', color: 'orange' },
  [STATUS.STATUS_OUTPUT_LIMIT_EXCEEDED]: { label: 'Output Limit Exceeded', color: 'orange' },
  [STATUS.STATUS_RUNTIME_ERROR]: { label: 'Runtime Error', color: 'red' },
  [STATUS.STATUS_COMPILE_ERROR]: { label: 'Compile Error', color: 'red' },
  [STATUS.STATUS_SYSTEM_ERROR]: { label: 'System Error', color: 'red' },
  [STATUS.STATUS_CANCELED]: { label: 'Canceled', color: 'gray' },
  [STATUS.STATUS_JUDGING]: { label: 'Judging', color: 'blue' },
  [STATUS.STATUS_COMPILING]: { label: 'Compiling', color: 'blue' },
  [STATUS.STATUS_FETCHED]: { label: 'Fetched', color: 'blue' },
  [STATUS.STATUS_IGNORED]: { label: 'Ignored', color: 'gray' },
};

interface RecordStatusBadgeProps {
  status: number;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function RecordStatusBadge({ status, size = 'sm' }: RecordStatusBadgeProps) {
  const { t } = useI18n();
  const config = STATUS_CONFIG[status] || { label: `Unknown(${status})`, color: 'gray' };

  return (
    <Badge color={config.color} size={size} variant="light">
      {t(config.label)}
    </Badge>
  );
}
