import { Badge, Button, Card, Group, Stack, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

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
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!content.trim()) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'submit', content }),
      });
      const data = await res.json();
      if (data.error) {
        setError(formatErrorMessage(data.error, t('Submit failed')));
      } else {
        setContent('');
        navigate(window.location.href);
      }
    } catch {
      setError(t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Solutions')} - ${pdoc.pid}. ${pdoc.title}`} />
      {psdocs.length === 0 ? (
        <EmptyState message={t('No solutions')} />
      ) : (
        <Stack gap="md">
          {psdocs.map((s: any) => (
            <Card key={s.docId} withBorder p="lg" className="hydro-content-card">
              <Group justify="space-between" mb="sm">
                <UserLink user={udict[s.owner] || { _id: s.owner, uname: String(s.owner) }} />
                <Group gap="xs">
                  <Badge size="xs" variant="light">{s.vote || 0} {t('votes')}</Badge>
                  <TimeDisplay date={s.createdAt || s._id} format="relative" />
                </Group>
              </Group>
              <MarkdownRenderer content={s.content || ''} />
            </Card>
          ))}
        </Stack>
      )}
      {isLoggedIn && (
        <Card withBorder p="lg" className="hydro-content-card">
          <Text fw={700} mb="sm">{t('Write Solution')}</Text>
          {error && <Text c="red" size="sm" mb="md">{error}</Text>}
          <Textarea value={content} onChange={(e) => setContent(e.currentTarget.value)} minRows={6} autosize mb="md" />
          <Group justify="flex-end"><Button onClick={handleSubmit} loading={loading}>{t('Submit')}</Button></Group>
        </Card>
      )}
    </Stack>
  );
}
