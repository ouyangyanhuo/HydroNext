import { Badge, Card, Group, ScrollArea, Stack, Table, Text, Textarea, Title } from '@mantine/core';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { TwoColumnLayout } from '@/components/common/two-column-layout';
import { ErrorBanner } from '@/components/feedback/error-banner';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

export default function ManageUserImportPage() {
  const { t } = useI18n();
  const [users, setUsers] = useState('');
  const [previewUsers, setPreviewUsers] = useState<any[]>([]);
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
      else {
        setMessages(data.messages || []);
        setPreviewUsers(data.users || []);
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading('');
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader
        title={t('Import User')}
        back={{ to: 'manage_dashboard', label: t('System Management') }}
      />
      <ErrorBanner message={error} onClose={() => setError('')} />

      <TwoColumnLayout
        sidebarWidth="wide"
        sidebar={(
          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="md">{t('Messages')}</Title>
            {messages.length ? (
              <Stack gap={4}>
                {messages.map((message, index) => <Text key={index} size="xs" c="dimmed">{message}</Text>)}
              </Stack>
            ) : (
              <Text size="sm" c="dimmed">{t('No messages')}</Text>
            )}
          </Card>
        )}
      >
        <Card withBorder p="lg" className="hydro-content-card">
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
      </TwoColumnLayout>

      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" mb="md">
          <Title order={3} size="h4">{t('Preview')}</Title>
          <Badge variant="light" className="hydro-numeric">{previewUsers.length}</Badge>
        </Group>
        {previewUsers.length ? (
          <div className="hydro-table-wrap">
            <ScrollArea type="auto" scrollbarSize={8}>
              <Table striped highlightOnHover miw={760} className="hydro-data-table">
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('Email')}</Table.Th>
                    <Table.Th>{t('Username')}</Table.Th>
                    <Table.Th>{t('Display Name')}</Table.Th>
                    <Table.Th>{t('School')}</Table.Th>
                    <Table.Th>{t('Student ID')}</Table.Th>
                    <Table.Th>{t('Extra')}</Table.Th>
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {previewUsers.map((user, index) => {
                    const extra = Object.keys(user)
                      .filter((key) => !['email', 'username', 'password', 'displayName', 'school', 'studentId'].includes(key))
                      .map((key) => `${key}: ${String(user[key])}`)
                      .join(', ');
                    return (
                      <Table.Tr key={`${user.email}-${index}`}>
                        <Table.Td><Text size="sm">{user.email}</Text></Table.Td>
                        <Table.Td><Text size="sm">{user.username}</Text></Table.Td>
                        <Table.Td><Text size="sm">{user.displayName || '-'}</Text></Table.Td>
                        <Table.Td><Text size="sm">{user.school || '-'}</Text></Table.Td>
                        <Table.Td><Text size="sm">{user.studentId || '-'}</Text></Table.Td>
                        <Table.Td><Text size="xs" c="dimmed">{extra || '-'}</Text></Table.Td>
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </div>
        ) : (
          <Text size="sm" c="dimmed">{t('No preview data')}</Text>
        )}
      </Card>
    </Stack>
  );
}
