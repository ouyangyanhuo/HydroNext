import { formatErrorMessage } from '@/utils/error';
import { Button, Paper, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainJoinPage() {
  
  const { t } = useI18n();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'join' }),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else navigate(window.location.pathname);
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  return (
    <div className="mx-auto max-w-md py-8">
      <Paper p="xl" withBorder>
        <Stack align="center" gap="md">
          <Title order={2}>{t('Join Domain')}</Title>
          {error && <Text c="red" size="sm">{error}</Text>}
          <Text ta="center">{t('Click the button below to request joining this domain.')}</Text>
          <Button onClick={handleJoin} loading={loading}>{t('Request to Join')}</Button>
        </Stack>
      </Paper>
    </div>
  );
}
