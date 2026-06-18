import { Badge, Button, Card, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { ContestTimer } from '@/components/contest/contest-timer';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';

function ContestProblemList({ tdoc }: { tdoc: any }) {
  const { t } = useI18n();
  const pdoc = tdoc.pdoc || [];
  const psdict = tdoc.psdict || {};

  if (!pdoc || pdoc.length === 0) return null;

  return (
    <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
      <Title order={4} mb="sm">{t('Problems')}</Title>
      <Stack gap={8}>
        {pdoc.map((p: any, i: number) => {
          const pid = p.pid || String.fromCharCode(65 + i);
          const psdoc = psdict[p.docId];
          return (
            <Group key={p.docId || i} justify="space-between" wrap="nowrap" p="xs" className="rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] hover:bg-[var(--hydro-surface-muted)]">
              <Group gap="sm" wrap="nowrap" className="min-w-0">
                <Badge size="md" variant="filled" className="shrink-0">{pid}</Badge>
                <Link
                  to="contest_detail_problem"
                  params={{ tid: tdoc._id || tdoc.docId, pid: p.docId || pid }}
                  className="hydro-subtle-link min-w-0"
                >
                  <Text size="sm" fw={700} className="truncate">{p.title}</Text>
                </Link>
              </Group>
              {psdoc?.status !== undefined && (
                <Badge size="xs" variant="light" color={psdoc.status === 1 ? 'green' : 'red'} className="shrink-0">
                  {psdoc.score ?? ''}
                </Badge>
              )}
            </Group>
          );
        })}
      </Stack>
    </Card>
  );
}

function ContestInfoCard({ tdoc }: { tdoc: any }) {
  const { t } = useI18n();

  return (
    <Paper withBorder p="md" className="hydro-panel">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('Start')}</Text>
          <TimeDisplay date={tdoc.beginAt} format="absolute" size="xs" />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('End')}</Text>
          <TimeDisplay date={tdoc.endAt} format="absolute" size="xs" />
        </Group>
        <Group justify="space-between" wrap="nowrap">
          <Text size="xs" c="dimmed" fw={700}>{t('Rule')}</Text>
          <Badge size="xs" variant="light">{tdoc.rule}</Badge>
        </Group>
      </Stack>
    </Paper>
  );
}

export default function ContestDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();
  const navigate = useNavigate();

  const tdoc = args.tdoc || {};
  const tsdoc = args.tsdoc || {};
  const files = args.files || [];

  const handleAttend = async () => {
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'attend' }),
      });
      const data = await res.json();
      if (!data.error) {
        navigate(window.location.href);
      }
    } catch (err) {
      console.error('Failed to attend:', err);
    }
  };

  return (
    <Stack gap="lg">
      <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
        <Group justify="space-between" align="flex-start" gap="lg">
          <div className="min-w-0 flex-1">
            <Badge variant="light" color="hydroCopper" mb="sm">
              {t('Contest')}
            </Badge>
            <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">
              {tdoc.title}
            </Title>
          </div>
          <div className="shrink-0">
            <ContestTimer beginAt={tdoc.beginAt} endAt={tdoc.endAt} />
          </div>
        </Group>
      </Card>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="flex-1 min-w-0">
          {tdoc.content && (
            <Card withBorder p="lg" mb="md" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
              <MarkdownRenderer content={tdoc.content} />
            </Card>
          )}

          <ContestProblemList tdoc={tdoc} />

          {files.length > 0 && (
            <Card withBorder p="lg" mt="md" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
              <Title order={4} mb="sm">{t('Files')}</Title>
              <Stack gap="xs">
                {files.map((f: any) => (
                  <Group key={f.name} justify="space-between" className="rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] px-3 py-2">
                    <Text size="sm" fw={600}>{f.name}</Text>
                    <Text size="xs" c="dimmed">{Math.round((f.size || 0) / 1024)}KB</Text>
                  </Group>
                ))}
              </Stack>
            </Card>
          )}
        </div>

        <div className="w-full lg:w-64 shrink-0">
          <Stack gap="md">
            <ContestInfoCard tdoc={tdoc} />

            {isLoggedIn && !tsdoc.attend && (
              <Button fullWidth onClick={handleAttend}>
                {t('Register Contest')}
              </Button>
            )}

            {isLoggedIn && tsdoc.attend && (
              <Button component={Link} to="contest_scoreboard" params={{ tid: tdoc._id || tdoc.docId }} variant="light" fullWidth>
                {t('Scoreboard')}
              </Button>
            )}
          </Stack>
        </div>
      </div>
    </Stack>
  );
}
