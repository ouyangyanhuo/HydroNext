import { Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { useEffect, useState } from 'react';
import { CodeReplay } from '@/components/record/code-replay';
import { Link } from '@/components/link';
import { usePageData, useUiContext } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function CodeReplayPage() {
  const { args } = usePageData();
  const ui = useUiContext();
  const { t } = useI18n();
  const [data, setData] = useState<any>(args);
  const [loading, setLoading] = useState(!!ui.codeReplayDataUrl);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!ui.codeReplayDataUrl) return;
    let disposed = false;
    setLoading(true);
    fetch(ui.codeReplayDataUrl, { headers: { Accept: 'application/json' } })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
      })
      .then((body) => {
        if (!disposed) setData(body);
      })
      .catch((err) => {
        if (!disposed) setError(err?.message || t('No replay data is available.'));
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => { disposed = true; };
  }, [t, ui.codeReplayDataUrl]);

  const replay = data.replay || {};
  const rdoc = data.rdoc || args.rdoc || {};
  const pdoc = data.pdoc || args.pdoc || {};

  return (
    <Stack gap="lg">
      <Card withBorder p="xl" className="hydro-content-card">
        <Group justify="space-between" align="flex-start" gap="md">
          <div className="min-w-0">
            <Title order={1} className="text-3xl text-[var(--hydro-text)]">{t('Code Replay')}</Title>
            <Text size="sm" c="dimmed" mt="xs">
              {pdoc.pid || pdoc.docId ? `${pdoc.pid || pdoc.docId}. ${pdoc.title || ''}` : t('Replay editing process')}
            </Text>
          </div>
          {rdoc._id && (
            <Button component={Link} to="record_detail" params={{ rid: rdoc._id }} variant="light" size="xs">
              {t('Back')}
            </Button>
          )}
        </Group>
      </Card>

      {loading ? (
        <Card withBorder p="xl" className="hydro-content-card">
          <Group justify="center"><Loader size="sm" /></Group>
        </Card>
      ) : error ? (
        <Card withBorder p="xl" className="hydro-content-card">
          <Text c="red" size="sm">{error}</Text>
        </Card>
      ) : replay?._id ? (
        <CodeReplay replay={replay} language={replay.lang || rdoc.lang} />
      ) : (
        <Card withBorder p="xl" className="hydro-content-card">
          <Text size="sm" c="dimmed">{t('No replay data is available.')}</Text>
        </Card>
      )}
    </Stack>
  );
}
