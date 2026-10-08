import { Badge, Card, Group, SimpleGrid, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconClock, IconServer } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { isRuntimeInfo, runtimeDuration } from '@/utils/runtime-info';

export function RuntimeStatusCard({ runtime }: { runtime: unknown }) {
  const { t } = useI18n();
  const info = isRuntimeInfo(runtime) ? runtime : null;
  const snapshot = info?.sampledAt;
  const [elapsed, setElapsed] = useState({ snapshot, milliseconds: 0 });
  useEffect(() => {
    if (!snapshot) return undefined;
    const start = performance.now();
    // Server uptime is the baseline; browser clock/timezone changes cannot change it.
    const timer = window.setInterval(() => setElapsed({ snapshot, milliseconds: performance.now() - start }), 1000);
    return () => window.clearInterval(timer);
  }, [snapshot]);

  if (!info) {
    return <Card withBorder p="lg" className="hydro-content-card">
      <Text c="dimmed">{t('Runtime information unavailable.')}</Text>
    </Card>;
  }

  const duration = runtimeDuration(info.uptimeSeconds, elapsed.snapshot === snapshot ? elapsed.milliseconds : 0);
  return <Card withBorder p="lg" className="hydro-content-card">
    <Stack gap="lg">
      <Group justify="space-between">
        <Group gap="sm">
          <ThemeIcon variant="light" size={38} radius="md"><IconServer size={20} /></ThemeIcon>
          <Title order={2} size="h4">{t(info.kind === 'container' ? 'Container runtime' : 'Application runtime')}</Title>
        </Group>
        <Badge color="green" variant="light">{t('Running')}</Badge>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="lg">
        <Stack gap={6}>
          <Text size="sm" c="dimmed">{t('Continuous uptime')}</Text>
          <Text size="xl" fw={700} style={{ fontVariantNumeric: 'tabular-nums' }} data-runtime-uptime>
            {t('{days}d {hours}h {minutes}m {seconds}s', duration)}
          </Text>
        </Stack>
        <Stack gap={6}>
          <Group gap={6}><IconClock size={15} /><Text size="sm" c="dimmed">{t('Started at')}</Text></Group>
          <Text component="time" dateTime={info.startedAt} fw={600}>
            {new Date(info.startedAt).toLocaleString(undefined, {
              year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
              hour12: false, timeZoneName: 'short',
            })}
          </Text>
        </Stack>
      </SimpleGrid>
      <Text size="xs" c="dimmed">{t(info.kind === 'container'
        ? 'Based on container PID 1. Reloading the application does not reset this timer.'
        : info.containerDetected ? 'Container timing is unavailable; showing the application process instead.'
          : 'Not running in a container; showing the application process.')}</Text>
    </Stack>
  </Card>;
}
