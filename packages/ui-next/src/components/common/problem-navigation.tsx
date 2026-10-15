import { Group, Loader, Paper, Stack, Text } from '@mantine/core';
import { IconArrowLeft, IconArrowRight } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { Link } from '@/components/link';
import { usePageData, useUiContext, useUserContext } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { formatErrorMessage } from '@/utils/error';
import { extractLocalizedContent } from '@/utils/i18n-content';
import { getProblemNavigationSource, type ProblemNavigationData, resolveProblemNavigation } from '@/utils/problem-navigation';
import { Button } from './button';

export function ProblemNavigation() {
  const { args } = usePageData();
  const ui = useUiContext();
  const user = useUserContext();
  const buildUrl = useBuildUrl();
  const { t } = useI18n();
  const language = useSessionStore((s) => s.language);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ key: string, data?: ProblemNavigationData | null, error?: string } | null>(null);
  const search = window.location.search;
  const source = getProblemNavigationSource({ contest: args.tdoc, search, buildUrl });
  const enabled = !!source;
  const key = JSON.stringify([ui.domainId, user._id, String(user.perm), args.pdoc?.docId, search, attempt]);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const load = async (url: string) => {
      const target = new URL(url, window.location.href);
      if (target.origin !== window.location.origin || !['http:', 'https:'].includes(target.protocol)) throw new Error('Failed');
      const response = await fetch(target.href, {
        signal: controller.signal, cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' },
      });
      const data = await response.json();
      if (!response.ok || data.error || data.url) throw new Error(formatErrorMessage(data.error, t('Failed'), t));
      return data;
    };
    void resolveProblemNavigation({ problem: args.pdoc, contest: args.tdoc, search, buildUrl, load }).then((data) => {
      if (!controller.signal.aborted) setResult({ key, data });
    }).catch((error) => {
      if (!controller.signal.aborted) setResult({ key, error: error.message || 'Failed' });
    });
    return () => controller.abort();
  }, [enabled, key, search, buildUrl, args.pdoc, args.tdoc, t]);

  if (!enabled) return null;
  const current = result?.key === key ? result : null;
  const data = current?.data;
  return (
    <Paper withBorder p="md" className="hydro-panel" component="nav" aria-label={t('Problem navigation')} aria-busy={!current}>
      <Stack gap="sm">
        <Group justify="space-between" gap="xs">
          <Text size="sm" fw="var(--hydro-weight-semibold)">{t('Problem navigation')}</Text>
          {!current && <Loader size="xs" aria-label={t('Loading...')} />}
        </Group>
        {(['previous', 'next'] as const).map((direction) => {
          const target = data?.[direction];
          if (!target) return null;
          const label = t(direction === 'previous' ? 'Previous problem' : 'Next problem');
          const icon = direction === 'previous' ? <IconArrowLeft size={15} /> : <IconArrowRight size={15} />;
          return (
            <Button
              key={direction}
              component={Link}
              href={target.href}
              variant="light"
              h="auto"
              mih={56}
              py="xs"
              fullWidth
              justify="flex-start"
              leftSection={icon}
            >
              <Stack gap={2} align="flex-start" style={{ minWidth: 0 }}>
                <Text component="span" size="sm">{label}</Text>
                <Text component="span" size="xs" c="dimmed" truncate maw={170}>
                  {target.pid}{target.title ? ` · ${extractLocalizedContent(target.title, language)}` : ''}
                </Text>
              </Stack>
            </Button>
          );
        })}
        {data && !data.previous && !data.next && (
          <Text size="sm" c="dimmed" ta="center" py="md" role="status">{t('No other problems')}</Text>
        )}
        {current?.error && <>
          <Text size="xs" c="dimmed" role="status">{t(current.error)}</Text>
          <Button variant="subtle" size="xs" onClick={() => setAttempt((value) => value + 1)}>{t('Retry')}</Button>
        </>}
      </Stack>
    </Paper>
  );
}
