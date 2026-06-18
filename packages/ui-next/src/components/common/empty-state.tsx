import { Center, Text, Stack } from '@mantine/core';

interface EmptyStateProps {
    message?: string;
    children?: React.ReactNode;
}

export function EmptyState({ message = 'No data', children }: EmptyStateProps) {
    return (
        <Center className="min-h-[200px]">
            <Stack align="center" gap="md">
                <Text c="dimmed" size="sm">{message}</Text>
                {children}
            </Stack>
        </Center>
    );
}
