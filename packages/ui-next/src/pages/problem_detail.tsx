import { Badge, Button, Card, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { usePageData } from '@/context/page-data';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

function ProblemMeta({ pdoc }: { pdoc: any }) {
  const { t } = useI18n();
  const limits = pdoc.limits || {};
  const items = [
    limits.time && { label: t('Time Limit'), value: `${limits.time}ms` },
    limits.memory && { label: t('Memory Limit'), value: `${Math.round(limits.memory / 1024)}MB` },
    pdoc.nSubmit !== undefined && { label: t('Submissions'), value: `${pdoc.nAccept || 0}/${pdoc.nSubmit || 0}` },
  ].filter(Boolean) as { label: string, value: string }[];

  if (!items.length) return null;

  return (
    <Group gap="sm" wrap="wrap">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] px-3 py-2">
          <Text size="xs" c="dimmed" fw={700}>{item.label}</Text>
          <Text size="sm" fw={800} className="text-[var(--hydro-text)]">{item.value}</Text>
        </div>
      ))}
    </Group>
  );
}

function ProblemSidebar({ pdoc, psdoc, rdoc }: { pdoc: any, psdoc?: any, rdoc?: any }) {
  const { t } = useI18n();
  const isLoggedIn = useIsLoggedIn();

  return (
    <Stack gap="md">
      {psdoc && psdoc.status !== undefined && (
        <Paper withBorder p="md" className="hydro-panel">
          <Text size="xs" c="dimmed" mb="xs">{t('Your Status')}</Text>
          <RecordStatusBadge status={psdoc.status} />
          {psdoc.score !== undefined && (
            <Text size="sm" mt="xs">
              {t('Score')}: {psdoc.score}
            </Text>
          )}
        </Paper>
      )}

      <Paper withBorder p="md" className="hydro-panel">
        <Stack gap="xs">
          {isLoggedIn && (
            <Button
              component={Link}
              to="problem_submit"
              params={{ pid: pdoc.pid || pdoc.docId }}
              fullWidth
              size="sm"
            >
              {t('Submit')}
            </Button>
          )}
          <Button
            component={Link}
            to="problem_solution"
            params={{ pid: pdoc.pid || pdoc.docId }}
            variant="light"
            fullWidth
            size="sm"
          >
            {t('Solutions')}
          </Button>
          <Button
            component={Link}
            to="record_main"
            params={{}}
            variant="subtle"
            fullWidth
            size="sm"
          >
            {t('All Records')}
          </Button>
        </Stack>
      </Paper>

      {rdoc && (
        <Paper withBorder p="md" className="hydro-panel">
          <Text size="xs" c="dimmed" mb="xs">{t('Latest Record')}</Text>
          <Link
            to="record_detail"
            params={{ rid: rdoc._id }}
            className="no-underline"
          >
            <Group gap="xs">
              <RecordStatusBadge status={rdoc.status} size="xs" />
              <TimeDisplay date={rdoc.judgeAt || rdoc._id?.toString()?.substring(0, 8)} format="relative" />
            </Group>
          </Link>
        </Paper>
      )}
    </Stack>
  );
}

export default function ProblemDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const language = useSessionStore((s) => s.language);

  const pdoc = args.pdoc || {};
  const psdoc = args.psdoc;
  const rdoc = args.rdoc;

  const title = extractLocalizedContent(pdoc.title, language);

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      <div className="flex-1 min-w-0">
        <Stack gap="lg">
          <Card withBorder p="xl" className="overflow-hidden border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-md)]">
            <Group justify="space-between" align="flex-start" gap="md" wrap="wrap">
              <div className="min-w-0 flex-1">
                <Badge variant="light" color="hydroTeal" mb="sm">
                  {t('Problem')}
                </Badge>
                <Title order={1} className="text-3xl leading-tight text-[var(--hydro-text)] md:text-4xl">
                  <span className="text-[var(--hydro-primary)]">{pdoc.pid || pdoc.docId}</span>
                  {' '}
                  {title}
                </Title>
              </div>
            </Group>
            <div className="mt-5">
              <ProblemMeta pdoc={pdoc} />
            </div>
          </Card>

          <Card withBorder p="lg" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] shadow-[var(--hydro-shadow-sm)]">
            <MarkdownRenderer content={pdoc.content || ''} />
          </Card>
        </Stack>
      </div>

      <div className="w-full lg:w-64 shrink-0">
        <ProblemSidebar pdoc={pdoc} psdoc={psdoc} rdoc={rdoc} />
      </div>
    </div>
  );
}
