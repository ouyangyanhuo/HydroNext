import { Badge, Button, Card, Checkbox, FileInput, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconArrowLeft, IconFileZip } from '@tabler/icons-react';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { formatErrorMessage } from '@/utils/error';

export default function ProblemImportHydroPage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const isLoggedIn = useIsLoggedIn();
  const canCreate = useHasPriv(PRIV.PRIV_CREATE_PROBLEM);
  const [file, setFile] = useState<File | null>(null);
  const [preferredPrefix, setPreferredPrefix] = useState('');
  const [hidden, setHidden] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!isLoggedIn || !canCreate) {
    return (
      <Stack gap="lg">
        <PageHeader title={t('Import From Hydro')} />
        <Card withBorder p="lg" className="hydro-content-card">
          <Text c="dimmed">{t('You do not have permission to import problems.')}</Text>
        </Card>
      </Stack>
    );
  }

  const handleSubmit = async () => {
    if (!file) {
      setError(t('Please select a file'));
      return;
    }
    setLoading(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (preferredPrefix) formData.append('preferredPrefix', preferredPrefix);
      if (hidden) formData.append('hidden', 'on');
      const res = await fetch('/problem/import/hydro', {
        method: 'POST',
        body: formData,
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('json')) {
        const data = await res.json();
        if (data.error) {
          setError(formatErrorMessage(data.error, t('Import failed')));
        } else if (data.redirect) {
          navigate(data.redirect);
        } else {
          navigate('/p');
        }
      } else {
        navigate('/p');
      }
    } catch {
      setError(t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Import From Hydro')}>
        <Button
          component="a"
          href="/problem/import"
          variant="subtle"
          size="xs"
          leftSection={<IconArrowLeft size={14} />}
        >
          {t('Back')}
        </Button>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card withBorder p="lg" className="hydro-content-card min-w-0 flex-1">
          <Stack gap="md">
            <Title order={4}>{t('Upload zipfile')}</Title>
            <Text size="sm" c="dimmed">
              {t('With this feature, you can import problems that you can view from a site to here. Their title, content, tags and categories will be imported.')}
            </Text>

            <FileInput
              label={t('File')}
              placeholder={t('Select a zip file')}
              accept=".zip"
              value={file}
              onChange={setFile}
              leftSection={<IconFileZip size={16} />}
              required
            />

            <TextInput
              label={t('Preferred Prefix')}
              placeholder={t('Leave empty for default')}
              value={preferredPrefix}
              onChange={(e) => setPreferredPrefix(e.currentTarget.value)}
              description={t('The preferred problem ID prefix.')}
            />

            <Checkbox
              label={t('Hidden')}
              description={t('Make the problem hidden.')}
              checked={hidden}
              onChange={(e) => setHidden(e.currentTarget.checked)}
            />

            {error && <Text c="red" size="sm">{error}</Text>}

            <Group justify="flex-end">
              <Button onClick={handleSubmit} loading={loading} disabled={!file}>
                {t('Upload')}
              </Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="lg" className="hydro-content-card w-full shrink-0 lg:w-80">
          <Stack gap="md">
            <Title order={4}>{t('What is this?')}</Title>
            <Text size="sm" c="dimmed">
              {t('With this feature, you can import problems that you can view from a site to here. Their title, content, tags and categories will be imported.')}
            </Text>
            <Title order={5}>{t('About preferredPrefix option')}</Title>
            <Text size="sm" c="dimmed">
              {t('preferredPrefix_hint')}
            </Text>
          </Stack>
        </Card>
      </div>
    </Stack>
  );
}
