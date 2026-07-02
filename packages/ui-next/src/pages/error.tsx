import { Button, Center, Group, Stack, Text, Title } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';

export default function ErrorPage() {
  const { args, url } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const isLoggedIn = useIsLoggedIn();
  const error = typeof args.error === 'object' ? args.error : undefined;
  const code = args.code || error?.code || 500;
  const message = t(error?.message || args.message || 'An error occurred', ...(error?.params || []));
  const isPermissionError = code === 401 || code === 403;
  const loginUrl = `${buildUrl('user_login')}?redirect=${encodeURIComponent(url)}`;

  return (
    <Center className="min-h-[60vh]">
      <Stack align="center" gap="md">
        <Title order={1} c="dimmed">{code}</Title>
        <Text size="lg">{message}</Text>
        <Group>
          {isPermissionError && !isLoggedIn && (
            <Button component={Link} href={loginUrl}>
              {t('Login')}
            </Button>
          )}
          <Button component={Link} to="homepage" variant="light">
            {t('Back to Home')}
          </Button>
        </Group>
      </Stack>
    </Center>
  );
}
