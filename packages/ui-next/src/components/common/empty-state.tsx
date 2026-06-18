import { Center, Stack, Text } from '@mantine/core';

interface EmptyStateProps {
  message?: string;
  children?: React.ReactNode;
}

export function EmptyState({ message = 'No data', children }: EmptyStateProps) {
  return (
    <Center className="hydro-empty-state min-h-[220px]">
      <Stack align="center" gap="md">
        <div className="h-10 w-10 rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface-tint)]" />
        <Text c="dimmed" size="sm" fw={600}>{message}</Text>
        {children}
      </Stack>
    </Center>
  );
}
