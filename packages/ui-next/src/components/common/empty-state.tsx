import { Center, Stack, Text } from '@mantine/core';
import { IconInbox } from '@tabler/icons-react';

export interface EmptyStateProps {
  message?: string;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  children?: React.ReactNode;
}

export function EmptyState({
  message = 'No data',
  description,
  icon,
  action,
  children,
}: EmptyStateProps) {
  return (
    <Center className="hydro-empty-state min-h-[220px] px-6 py-10">
      <Stack align="center" gap="sm" className="max-w-sm text-center">
        <div className="hydro-empty-state__icon" aria-hidden="true">
          {icon ?? <IconInbox size={24} stroke={1.65} />}
        </div>
        <Text size="sm" fw="var(--hydro-weight-semibold)" className="text-[var(--hydro-text)]">
          {message}
        </Text>
        {description && (
          <Text c="dimmed" size="xs" className="leading-relaxed">
            {description}
          </Text>
        )}
        {action && <div className="mt-1">{action}</div>}
        {children}
      </Stack>
    </Center>
  );
}
