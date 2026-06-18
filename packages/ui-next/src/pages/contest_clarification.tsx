import { Badge, Button, Divider, Group, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function ContestClarificationPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const tdoc = args.tdoc || {};
  const clarifications = args.clarifications || [];
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAsk = async () => {
    if (!question.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ content: question }) });
      const data = await res.json();
      if (!data.error) { setQuestion(''); navigate(window.location.href); }
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Clarifications')} - ${tdoc.title}`} />
      {clarifications.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">{t('No clarifications')}</Text>
      ) : (
        <Stack gap="xs">
          {clarifications.map((c: any) => (
            <Paper key={c._id} withBorder p="md">
              <Group justify="space-between" mb={4}>
                <Group gap="xs">
                  <Badge size="xs" variant="light">{c.respondent ? t('Answered') : t('Pending')}</Badge>
                  {c.pid && <Badge size="xs">{c.pid}</Badge>}
                </Group>
                <TimeDisplay date={c._id} format="relative" />
              </Group>
              <Text size="sm">{c.content}</Text>
              {c.reply && (
                <>
                  <Divider my="sm" />
                  <Text size="sm" c="blue">{c.reply}</Text>
                </>
              )}
            </Paper>
          ))}
        </Stack>
      )}
      <Paper withBorder p="lg">
        <Textarea label={t('Ask a Question')} value={question} onChange={(e) => setQuestion(e.currentTarget.value)} minRows={3} mb="md" />
        <Group justify="flex-end"><Button onClick={handleAsk} loading={loading}>{t('Submit')}</Button></Group>
      </Paper>
    </Stack>
  );
}
