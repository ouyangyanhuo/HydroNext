import { Badge, Center, Group, Paper, Stack, Text, Title } from '@mantine/core';
import {
  IconAlertTriangle, IconArrowLeft, IconCompassOff, IconHome, IconLogin2, IconRefresh, IconShieldLock,
} from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { canRetryProtectedAccess } from '@/registry/request-security';
import { goBackOrFallback } from '@/utils/history-back';
import { formatRequestError as proctorError } from '@/utils/request';

function getErrorPresentation(code: number, t: (key: string) => string) {
  if (code === 401 || code === 403) {
    return {
      tone: 'warning' as const,
      icon: IconShieldLock,
      heading: t('Access Denied'),
    };
  }
  if (code === 404) {
    return {
      tone: 'primary' as const,
      icon: IconCompassOff,
      heading: t('Page not found'),
    };
  }
  return {
    tone: 'danger' as const,
    icon: IconAlertTriangle,
    heading: t('Something went wrong'),
  };
}

export default function ErrorPage() {
  const { args, url } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const [retrying, setRetrying] = useState(false);
  const isLoggedIn = useIsLoggedIn();
  const error = typeof args.error === 'object' ? args.error : undefined;
  const code = Number(args.code || error?.code || 500);
  const message = error?.name === 'ForbiddenError'
    ? t(proctorError(error))
    : t(error?.message || args.message || 'An error occurred', ...(error?.params || []));
  const isPermissionError = code === 401 || code === 403;
  const isServerError = code >= 500;
  const loginUrl = `${buildUrl('user_login')}?redirect=${encodeURIComponent(url)}`;
  const canRetryProctor = isPermissionError && canRetryProtectedAccess(url);
  const { tone, icon: StatusIcon, heading } = getErrorPresentation(code, t);
  const showDetail = Boolean(message && message.trim() !== heading.trim());
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
    <Center className="min-h-[60vh] px-4 py-8">
      <Paper withBorder p="xl" className={`hydro-content-card hydro-error-card hydro-error-card--${tone}`}>
        <Stack align="center" gap="md" className="text-center">
          <div className="hydro-error-card__icon" aria-hidden="true">
            <StatusIcon size={30} stroke={1.75} />
          </div>
          <Badge variant="light" size="sm" className="hydro-error-card__code hydro-numeric">
            HTTP {code}
          </Badge>
          <Stack align="center" gap={6}>
            <Title order={2} className="text-[var(--hydro-text)]">
              {heading}
            </Title>
            {showDetail && (
              <Text size="sm" c="dimmed" className="max-w-md leading-relaxed">
                {message}
              </Text>
            )}
          </Stack>
          <Group justify="center" gap="sm" mt="xs" wrap="wrap">
            <Button
              variant="default"
              leftSection={<IconArrowLeft size={16} />}
              onClick={() => goBackOrFallback(window.history, () => { void navigate(buildUrl('homepage'), { replace: true }); })}
            >
              {t('Back')}
            </Button>
            {canRetryProctor && (
              <Button loading={retrying} leftSection={<IconRefresh size={16} />} onClick={() => void retry()}>
                {t('Verify client and continue')}
              </Button>
            )}
            {isServerError && (
              <Button loading={retrying} variant="light" leftSection={<IconRefresh size={16} />} onClick={() => void retry()}>
                {t('Reload page')}
              </Button>
            )}
            {isPermissionError && !isLoggedIn && (
              <Button component={Link} href={loginUrl} leftSection={<IconLogin2 size={16} />}>
                {t('Login')}
              </Button>
            )}
            <Button component={Link} to="homepage" variant="light" leftSection={<IconHome size={16} />}>
              {t('Back to Home')}
            </Button>
          </Group>
        </Stack>
      </Paper>
    </Center>
  );
}
