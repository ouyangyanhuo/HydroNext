import { Paper, Title, Text, Group, Badge, Stack, SimpleGrid, Button, Divider } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { TimeDisplay } from '@/components/common/time-display';
import { useBuildUrl } from '@/hooks/use-build-url';

function ProblemMeta({ pdoc }: { pdoc: any }) {
    const { t } = useI18n();
    const limits = pdoc.limits || {};

    return (
        <Group gap="md" wrap="wrap">
            {limits.time && (
                <Text size="xs" c="dimmed">
                    {t('Time Limit')}: {limits.time}ms
                </Text>
            )}
            {limits.memory && (
                <Text size="xs" c="dimmed">
                    {t('Memory Limit')}: {Math.round(limits.memory / 1024)}MB
                </Text>
            )}
            {pdoc.nSubmit !== undefined && (
                <Text size="xs" c="dimmed">
                    {t('Submissions')}: {pdoc.nAccept || 0}/{pdoc.nSubmit || 0}
                </Text>
            )}
        </Group>
    );
}

function ProblemSidebar({ pdoc, psdoc, rdoc }: { pdoc: any; psdoc?: any; rdoc?: any }) {
    const { t } = useI18n();
    const isLoggedIn = useIsLoggedIn();
    const buildUrl = useBuildUrl();

    return (
        <Stack gap="md">
            {psdoc && psdoc.status !== undefined && (
                <Paper withBorder p="md">
                    <Text size="xs" c="dimmed" mb="xs">{t('Your Status')}</Text>
                    <RecordStatusBadge status={psdoc.status} />
                    {psdoc.score !== undefined && (
                        <Text size="sm" mt="xs">
                            {t('Score')}: {psdoc.score}
                        </Text>
                    )}
                </Paper>
            )}

            <Paper withBorder p="md">
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
                <Paper withBorder p="md">
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

    const pdoc = args.pdoc || {};
    const psdoc = args.psdoc;
    const rdoc = args.rdoc;
    const mode = args.mode || 'normal';

    return (
        <div className="flex flex-col lg:flex-row gap-6">
            <div className="flex-1 min-w-0">
                <Paper withBorder p="lg">
                    <Title order={2} mb="sm">{pdoc.pid}. {pdoc.title}</Title>
                    <ProblemMeta pdoc={pdoc} />
                    <Divider my="md" />
                    <MarkdownRenderer content={pdoc.content || ''} />
                </Paper>
            </div>

            <div className="w-full lg:w-64 shrink-0">
                <ProblemSidebar pdoc={pdoc} psdoc={psdoc} rdoc={rdoc} />
            </div>
        </div>
    );
}
