import { Badge, Button, Group, Paper, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';

export default function ProblemSolutionPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const psdocs = args.psdocs || [];
  const udict = args.udict || {};
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(window.location.href, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ content }) });
      const data = await res.json();
      if (!data.error) { setContent(''); navigate(window.location.href); }
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Solutions')} - ${pdoc.pid}. ${pdoc.title}`} />
      {psdocs.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">{t('No solutions')}</Text>
      ) : (
        <Stack gap="md">
          {psdocs.map((s: any) => (
            <Paper key={s.docId} withBorder p="lg">
              <Group justify="space-between" mb="sm">
                <UserLink user={udict[s.owner] || { _id: s.owner, uname: String(s.owner) }} />
                <Group gap="xs">
                  <Badge size="xs" variant="light">{s.vote || 0} votes</Badge>
                  <TimeDisplay date={s.createdAt || s._id} format="relative" />
                </Group>
              </Group>
              <MarkdownRenderer content={s.content || ''} />
            </Paper>
          ))}
        </Stack>
      )}
      {isLoggedIn && (
        <Paper withBorder p="lg">
          <Textarea label={t('Write Solution')} value={content} onChange={(e) => setContent(e.currentTarget.value)} minRows={6} autosize mb="md" />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Submit')}</Button></Group>
        </Paper>
      )}
    </Stack>
  );
}
