import { Paper, Title, Stack, Text, Group, Badge, Button, SimpleGrid } from '@mantine/core';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { UserLink } from '@/components/user/user-link';

export default function DiscussionMainPage() {
    const { args } = usePageData();
    const { t } = useI18n();
    const isLoggedIn = useIsLoggedIn();
    const ddocs = args.ddocs || [];
    const vnode = args.vnode || {};
    const udict = args.udict || {};
    const page = args.page || 1;
    const dpcount = args.dpcount || 1;

    return (
        <Stack gap="lg">
            <PageHeader title={vnode.title || t('Discussion')}>
                {isLoggedIn && (
                    <Button component={Link} to="discussion_create" size="xs">{t('Create')}</Button>
                )}
            </PageHeader>

            {ddocs.length === 0 ? (
                <Text c="dimmed" ta="center" py="xl">{t('No discussions')}</Text>
            ) : (
                <Stack gap="xs">
                    {ddocs.map((d: any) => (
                        <Paper key={d.docId} withBorder p="md">
                            <Group justify="space-between" align="flex-start">
                                <div className="flex-1 min-w-0">
                                    <Link to="discussion_detail" params={{ did: d.docId }} className="no-underline hover:underline">
                                        <Text fw={500}>{d.title}</Text>
                                    </Link>
                                    <Group gap="md" mt={4}>
                                        <UserLink user={udict[d.owner] || { _id: d.owner, uname: String(d.owner) }} size="xs" />
                                        <TimeDisplay date={d.updateAt || d.createdAt} format="relative" />
                                        {d.nReply !== undefined && (
                                            <Text size="xs" c="dimmed">{d.nReply} {t('replies')}</Text>
                                        )}
                                    </Group>
                                </div>
                            </Group>
                        </Paper>
                    ))}
                </Stack>
            )}

            <Paginator page={page} totalPages={dpcount} />
        </Stack>
    );
}
