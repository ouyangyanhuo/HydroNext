import { Paper, Title, Text, Group, Stack, Badge, Button, Divider, SimpleGrid } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { TimeDisplay } from '@/components/common/time-display';
import { useNavigate } from '@/context/router';

function ContestTimer({ beginAt, endAt }: { beginAt: string; endAt: string }) {
    const { t } = useI18n();
    const now = Date.now();
    const begin = new Date(beginAt).getTime();
    const end = new Date(endAt).getTime();
    const isRunning = now >= begin && now < end;
    const isUpcoming = now < begin;
    const isFinished = now >= end;

    const formatDuration = (ms: number) => {
        const hours = Math.floor(ms / 3600000);
        const minutes = Math.floor((ms % 3600000) / 60000);
        if (hours > 0) return `${hours}h ${minutes}m`;
        return `${minutes}m`;
    };

    return (
        <Paper withBorder p="md">
            <Group gap="md">
                <Badge size="lg" variant="light" color={isRunning ? 'green' : isUpcoming ? 'blue' : 'gray'}>
                    {isRunning ? t('Running') : isUpcoming ? t('Upcoming') : t('Finished')}
                </Badge>
                <Text size="sm">
                    {t('Duration')}: {formatDuration(end - begin)}
                </Text>
                {isRunning && (
                    <Text size="sm" c="green">
                        {t('Ends in')}: <TimeDisplay date={endAt} format="relative" size="sm" />
                    </Text>
                )}
                {isUpcoming && (
                    <Text size="sm" c="blue">
                        {t('Starts in')}: <TimeDisplay date={beginAt} format="relative" size="sm" />
                    </Text>
                )}
            </Group>
        </Paper>
    );
}

function ContestProblemList({ tdoc }: { tdoc: any }) {
    const { t } = useI18n();
    const pdoc = tdoc.pdoc || [];
    const psdict = tdoc.psdict || {};

    if (!pdoc || pdoc.length === 0) return null;

    return (
        <Paper withBorder p="lg">
            <Title order={4} mb="sm">{t('Problems')}</Title>
            <Stack gap="xs">
                {pdoc.map((p: any, i: number) => {
                    const pid = p.pid || String.fromCharCode(65 + i);
                    const psdoc = psdict[p.docId];
                    return (
                        <Group key={p.docId || i} justify="space-between" p="xs" className="rounded bg-[var(--hydro-surface)]">
                            <Group gap="sm">
                                <Badge size="sm" variant="filled">{pid}</Badge>
                                <Link
                                    to="contest_detail_problem"
                                    params={{ tid: tdoc._id || tdoc.docId, pid: p.docId || pid }}
                                    className="no-underline hover:underline text-[var(--hydro-text)]"
                                >
                                    <Text size="sm">{p.title}</Text>
                                </Link>
                            </Group>
                            {psdoc?.status !== undefined && (
                                <Badge size="xs" variant="light" color={psdoc.status === 1 ? 'green' : 'red'}>
                                    {psdoc.score ?? ''}
                                </Badge>
                            )}
                        </Group>
                    );
                })}
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
    const udict = args.udict || {};
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
            <Title order={2}>{tdoc.title}</Title>

            <ContestTimer beginAt={tdoc.beginAt} endAt={tdoc.endAt} />

            <div className="flex flex-col lg:flex-row gap-6">
                <div className="flex-1 min-w-0">
                    {tdoc.content && (
                        <Paper withBorder p="lg" mb="md">
                            <MarkdownRenderer content={tdoc.content} />
                        </Paper>
                    )}

                    <ContestProblemList tdoc={tdoc} />

                    {files.length > 0 && (
                        <Paper withBorder p="lg" mt="md">
                            <Title order={4} mb="sm">{t('Files')}</Title>
                            <Stack gap="xs">
                                {files.map((f: any) => (
                                    <Group key={f.name} justify="space-between">
                                        <Text size="sm">{f.name}</Text>
                                        <Text size="xs" c="dimmed">{Math.round((f.size || 0) / 1024)}KB</Text>
                                    </Group>
                                ))}
                            </Stack>
                        </Paper>
                    )}
                </div>

                <div className="w-full lg:w-64 shrink-0">
                    <Stack gap="md">
                        <Paper withBorder p="md">
                            <Stack gap="xs">
                                <Group justify="space-between">
                                    <Text size="xs" c="dimmed">{t('Start')}</Text>
                                    <TimeDisplay date={tdoc.beginAt} format="absolute" size="xs" />
                                </Group>
                                <Group justify="space-between">
                                    <Text size="xs" c="dimmed">{t('End')}</Text>
                                    <TimeDisplay date={tdoc.endAt} format="absolute" size="xs" />
                                </Group>
                                <Group justify="space-between">
                                    <Text size="xs" c="dimmed">{t('Rule')}</Text>
                                    <Badge size="xs">{tdoc.rule}</Badge>
                                </Group>
                            </Stack>
                        </Paper>

                        {isLoggedIn && !tsdoc.attend && (
                            <Button fullWidth onClick={handleAttend}>
                                {t('Register')}
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
