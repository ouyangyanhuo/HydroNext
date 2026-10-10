import { Center, Group, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { proctorAccessRequest, proctorError } from '@/utils/proctor';

export default function ErrorPage() {
  const { args, url } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const isLoggedIn = useIsLoggedIn();
  const error = typeof args.error === 'object' ? args.error : undefined;
  const code = args.code || error?.code || 500;
  const message = error?.name === 'ForbiddenError'
    ? t(proctorError(error))
    : t(error?.message || args.message || 'An error occurred', ...(error?.params || []));
  const isPermissionError = code === 401 || code === 403;
  const loginUrl = `${buildUrl('user_login')}?redirect=${encodeURIComponent(url)}`;
  const canRetryProctor = isPermissionError && typeof (window as any).examAPI?.proctorHeaders === 'function'
    && !!proctorAccessRequest(url, window.location.origin);
  const retry = async () => {
    if (retrying) return;
    setRetrying(true);
    try {
      await navigate(url, { replace: true });
    } finally {
      setRetrying(false);
    }
  };

  return (
    <Center className="min-h-[60vh]">
      <Stack align="center" gap="md">
        <Title order={1} c="dimmed">{code}</Title>
        <Text size="lg">{message}</Text>
        <Group>
          {canRetryProctor && <Button loading={retrying} onClick={() => void retry()}>{t('Verify client and continue')}</Button>}
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
