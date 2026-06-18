import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';

export default function ErrorPage() {
  const { args } = usePageData();
  const code = args.code || 500;
  const message = args.message || 'An error occurred';

  return (
    <Center className="min-h-[60vh]">
      <Stack align="center" gap="md">
        <Title order={1} c="dimmed">{code}</Title>
        <Text size="lg">{message}</Text>
        <Button component={Link} to="homepage" variant="light">
          Back to Home
        </Button>
      </Stack>
    </Center>
  );
}
