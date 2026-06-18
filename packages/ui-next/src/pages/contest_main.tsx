import { useState } from 'react';
import { TextInput, Button, Group, Text, Badge, Stack, Card } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';

function ContestCard({ tdoc, tsdoc }: { tdoc: any; tsdoc?: any }) {
    const { t } = useI18n();
    const now = Date.now();
    const beginAt = new Date(tdoc.beginAt).getTime();
    const endAt = new Date(tdoc.endAt).getTime();
    const isRunning = now >= beginAt && now < endAt;
    const isUpcoming = now < beginAt;
    const isFinished = now >= endAt;

    return (
        <Card withBorder p="md">
            <Group justify="space-between" align="flex-start">
                <div className="flex-1 min-w-0">
                    <Group gap="xs" mb="xs">
                        <Badge size="xs" variant="light" color={isRunning ? 'green' : isUpcoming ? 'blue' : 'gray'}>
                            {isRunning ? t('Running') : isUpcoming ? t('Upcoming') : t('Finished')}
                        </Badge>
                        <Badge size="xs" variant="outline">{tdoc.rule}</Badge>
                    </Group>
                    <Link
                        to="contest_detail"
                        params={{ tid: tdoc.docId || tdoc._id }}
                        className="no-underline hover:underline"
                    >
                        <Text fw={500}>{tdoc.title}</Text>
                    </Link>
                    <Group gap="md" mt="xs">
                        <Text size="xs" c="dimmed">
                            {t('Start')}: <TimeDisplay date={tdoc.beginAt} format="absolute" size="xs" />
                        </Text>
                        <Text size="xs" c="dimmed">
                            {t('Duration')}: {Math.round((endAt - beginAt) / 60000)}min
                        </Text>
                    </Group>
                </div>
                {tsdoc?.attend && (
                    <Badge size="xs" color="green">{t('Registered')}</Badge>
                )}
            </Group>
        </Card>
    );
}

export default function ContestMainPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const navigate = useNavigate();

    const tdocs = args.tdocs || [];
    const tsdict = args.tsdict || {};
    const page = args.page || 1;
    const tpcount = args.tpcount || 1;
    const q = args.q || '';

    const [search, setSearch] = useState(q);

    const handleSearch = () => {
        const url = new URL(window.location.href);
        if (search) {
            url.searchParams.set('q', search);
        } else {
            url.searchParams.delete('q');
        }
        url.searchParams.delete('page');
        navigate(url.pathname + url.search);
    };

    return (
        <>
            <PageHeader title={t('Contests')}>
                <Group gap="xs">
                    <TextInput
                        placeholder={t('Search contests...')}
                        value={search}
                        onChange={(e) => setSearch(e.currentTarget.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        size="xs"
                        w={200}
                    />
                    <Button size="xs" onClick={handleSearch}>{t('Search')}</Button>
                </Group>
            </PageHeader>

            {tdocs.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">{t('No contests found')}</Text>
            ) : (
                <Stack gap="sm">
                    {tdocs.map((tdoc: any) => (
                        <ContestCard
                            key={tdoc.docId || tdoc._id}
                            tdoc={tdoc}
                            tsdoc={tsdict[tdoc.docId || tdoc._id]}
                        />
                    ))}
                </Stack>
            )}

            <Paginator page={page} totalPages={tpcount} />
        </>
    );
}
