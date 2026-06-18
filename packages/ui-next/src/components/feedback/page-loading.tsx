import { Center, Loader, Text, Stack } from '@mantine/core';

export function PageLoading() {
    return (
        <Center className="min-h-[50vh]">
            <Stack align="center" gap="md">
                <Loader size="lg" />
                <Text c="dimmed" size="sm">
                    Loading...
                </Text>
            </Stack>
        </Center>
    );
}
