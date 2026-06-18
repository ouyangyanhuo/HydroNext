import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';

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
        <EmptyState message={t('No discussions')} />
      ) : (
        <Stack gap="md">
          {ddocs.map((d: any) => (
            <Card key={d.docId} withBorder p="lg" className="hydro-card">
              <Group justify="space-between" align="flex-start">
                <div className="flex-1 min-w-0">
                  <Link to="discussion_detail" params={{ did: d.docId }} className="hydro-subtle-link">
                    <Text fw={700} className="truncate">{d.title}</Text>
                  </Link>
                  <Group gap="md" mt="xs" wrap="wrap">
                    <UserLink user={udict[d.owner] || { _id: d.owner, uname: String(d.owner) }} size="xs" />
                    <TimeDisplay date={d.updateAt || d.createdAt} format="relative" />
                    {d.nReply !== undefined && (
                      <Text size="xs" c="dimmed">{d.nReply} {t('replies')}</Text>
                    )}
                  </Group>
                </div>
              </Group>
            </Card>
          ))}
        </Stack>
      )}

      <Paginator page={page} totalPages={dpcount} />
    </Stack>
  );
}
