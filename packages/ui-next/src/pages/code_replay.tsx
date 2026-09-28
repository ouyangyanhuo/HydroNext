import { Button, Card, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useState } from 'react';
import { CodeReplay } from '@/components/record/code-replay';
import { usePageData, useUiContext } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { goBackOrFallback } from '@/utils/history-back';

function normalizeReplayDataUrl(url?: string) {
  const normalized = (url || `${window.location.pathname}/data`)
    .replace(/^(\/d\/([^/]+))\/d\/\2(?=\/)/, '$1');
  return normalized;
}

export default function CodeReplayPage() {
  const { args } = usePageData();
  const ui = useUiContext();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const dataUrl = normalizeReplayDataUrl(ui.codeReplayDataUrl);
  const [result, setResult] = useState<{ url: string, data?: any, error?: string }>({ url: '' });
  const loading = result.url !== dataUrl;
  const data = loading ? args : result.data || args;
  const error = loading ? '' : result.error;

  useEffect(() => {
    if (!dataUrl) return undefined;
    let disposed = false;
    const controller = new AbortController();
    fetch(dataUrl, { headers: { Accept: 'application/json' }, signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        return await res.json();
      })
      .then((body) => {
        if (!disposed) setResult({ url: dataUrl, data: body });
      })
      .catch((err) => {
        if (!disposed && err?.name !== 'AbortError') {
          setResult({ url: dataUrl, error: err?.message || t('No replay data is available.') });
        }
      });
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [t, dataUrl]);

  const replay = data.replay || {};
  const rdoc = data.rdoc || args.rdoc || {};
  const pdoc = data.pdoc || args.pdoc || {};

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center" gap="md" wrap="nowrap">
        <div className="min-w-0 flex-1">
          <Title order={1} size="h2" className="text-[var(--hydro-text)]">{t('Code Replay')}</Title>
          <Text size="sm" c="dimmed" mt={4} style={{ overflowWrap: 'anywhere' }}>
            {pdoc.pid || pdoc.docId ? `${pdoc.pid || pdoc.docId}. ${pdoc.title || ''}` : t('Replay editing process')}
          </Text>
        </div>
        <Button
          onClick={() => goBackOrFallback(window.history, () => {
            void navigate(rdoc._id
              ? buildUrl('record_detail', { rid: rdoc._id })
              : buildUrl('record_main'));
          })}
          variant="default"
          size="sm"
          leftSection={<IconArrowLeft size={16} />}
          style={{ flexShrink: 0 }}
        >
          {t('Back')}
        </Button>
      </Group>

      {loading ? (
        <Card withBorder p="xl" className="hydro-content-card">
          <Group justify="center"><Loader size="sm" /></Group>
        </Card>
      ) : error ? (
        <Card withBorder p="xl" className="hydro-content-card">
          <Text c="red" size="sm">{error}</Text>
        </Card>
      ) : replay?._id ? (
        <CodeReplay key={replay._id} replay={replay} language={replay.lang || rdoc.lang} />
      ) : (
        <Card withBorder p="xl" className="hydro-content-card">
          <Text size="sm" c="dimmed">{t('No replay data is available.')}</Text>
        </Card>
      )}
    </Stack>
  );
}
