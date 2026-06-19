import { formatErrorMessage } from '@/utils/error';
import { Button, Card, Group, Stack, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { useI18n } from '@/hooks/use-i18n';

export default function ManageUserImportPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState('');
  const [loading, setLoading] = useState('');
  const [messages, setMessages] = useState<string[]>([]);
  const [error, setError] = useState('');

  const handleImport = async (draft: boolean) => {
    setLoading(draft ? 'preview' : 'submit');
    setMessages([]);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ users, draft }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Import failed')));
      else setMessages(data.messages || []);
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading('');
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Import User')} />
      {error && <Text c="red" size="sm">{error}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card withBorder p="lg" className="hydro-content-card min-w-0 flex-1">
          <Title order={3} size="h4" mb="md">{t('Users')}</Title>
          <Stack gap="md">
            <Textarea
              value={users}
              onChange={(e) => setUsers(e.currentTarget.value)}
              minRows={16}
              autosize
              placeholder="email, username, password, displayName"
              styles={{ input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } }}
            />
            <Group justify="flex-end">
              <Button variant="light" onClick={() => handleImport(true)} loading={loading === 'preview'}>{t('Preview')}</Button>
              <Button onClick={() => handleImport(false)} loading={loading === 'submit'}>{t('Submit')}</Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="lg" className="hydro-content-card w-full shrink-0 lg:w-80">
          <Title order={3} size="h4" mb="md">{t('Messages')}</Title>
          {messages.length ? (
            <Stack gap={4}>
              {messages.map((message, index) => <Text key={index} size="xs" c="dimmed">{message}</Text>)}
            </Stack>
          ) : (
            <Text size="sm" c="dimmed">{t('No messages')}</Text>
          )}
        </Card>
      </div>
    </Stack>
  );
}
