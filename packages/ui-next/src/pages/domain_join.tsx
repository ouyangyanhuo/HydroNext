import { formatErrorMessage } from '@/utils/error';
import { getAvatarUrl } from '@/utils/avatar';
import { Avatar, Button, Card, Group, Stack, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

const JOIN_METHOD_CODE = 2;

export default function DomainJoinPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const domainInfo = args.domainInfo || {};
  const joinSettings = args.joinSettings;
  const [code, setCode] = useState(args.code || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ code, target: args.target, redirect: args.redirect }),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.href = `/d/${args.target || domainInfo._id || 'system'}`;
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-2xl py-8">
      <Card p="xl" withBorder className="hydro-content-card">
        <Stack gap="lg">
          <Stack align="center" gap="sm">
            <Avatar src={getAvatarUrl(domainInfo.avatar)} size={64} radius="xl" />
            <Title order={2} ta="center">
              {joinSettings
                ? t('Join {0}').replace('{0}', domainInfo.name || args.target || '')
                : t('You are invited to join {0}').replace('{0}', domainInfo.name || args.target || '')}
            </Title>
            <Text ta="center" c="dimmed">
              {t('By clicking the button, you will become a member of the domain {0}.').replace('{0}', domainInfo.name || args.target || '')}
            </Text>
          </Stack>

          {domainInfo.owner && (
            <Group justify="center" gap="xs">
              <Text size="sm" c="dimmed">{t('The domain owner:')}</Text>
              <UserLink user={domainInfo.owner} size="sm" />
            </Group>
          )}

          {domainInfo.bulletin && (
            <Card withBorder p="md">
              <MarkdownRenderer content={domainInfo.bulletin} />
            </Card>
          )}

          {error && <Text c="red" size="sm">{error}</Text>}

          {Number(joinSettings?.method) === JOIN_METHOD_CODE && (
            <TextInput
              label={t('Invitation Code')}
              description={t('You need to enter the invitation code to join the domain.')}
              value={code}
              onChange={(e) => setCode(e.currentTarget.value)}
              required
              autoFocus
            />
          )}

          <Group justify="center">
            <Button onClick={handleJoin} loading={loading}>{t('Join')}</Button>
          </Group>
        </Stack>
      </Card>
    </div>
  );
}
