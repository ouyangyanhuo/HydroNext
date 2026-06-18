import { Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { TimeDisplay } from '@/components/common/time-display';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

function UserStats({ udoc }: { udoc: any }) {
  const { t } = useI18n();

  return (
    <SimpleGrid cols={3} spacing="md">
      <Paper withBorder p="md" ta="center">
        <Text size="xl" fw={700}>{udoc.nAccept || 0}</Text>
        <Text size="xs" c="dimmed">{t('Accepted')}</Text>
      </Paper>
      <Paper withBorder p="md" ta="center">
        <Text size="xl" fw={700}>{udoc.nSubmit || 0}</Text>
        <Text size="xs" c="dimmed">{t('Submissions')}</Text>
      </Paper>
      <Paper withBorder p="md" ta="center">
        <Text size="xl" fw={700}>{udoc.rating || '-'}</Text>
        <Text size="xs" c="dimmed">{t('Rating')}</Text>
      </Paper>
    </SimpleGrid>
  );
}

export default function UserDetailPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const currentUser = useSessionStore((s) => s.user);

  const udoc = args.udoc || {};
  const isSelf = currentUser._id === udoc._id;

  return (
    <Stack gap="lg">
      <Paper withBorder p="lg">
        <Group gap="lg" align="flex-start">
          <UserAvatar user={udoc} size={80} link={false} />
          <div className="flex-1">
            <Title order={2}>{udoc.uname}</Title>
            <Group gap="md" mt="xs">
              {udoc.mail && (
                <Text size="sm" c="dimmed">{udoc.mail}</Text>
              )}
              <Text size="xs" c="dimmed">
                {t('Joined')}: <TimeDisplay date={udoc.regat} format="absolute" size="xs" />
              </Text>
              {udoc.loginat && (
                <Text size="xs" c="dimmed">
                  {t('Last login')}: <TimeDisplay date={udoc.loginat} format="relative" size="xs" />
                </Text>
              )}
            </Group>
            {udoc.bio && (
              <Text size="sm" mt="sm">{udoc.bio}</Text>
            )}
          </div>
        </Group>
      </Paper>

      <UserStats udoc={udoc} />

      {isSelf && (
        <Paper withBorder p="md">
          <Text size="sm" c="dimmed">
            {t('This is your profile. You can edit your settings from the')}{' '}
            <a href="/home/settings">{t('settings page')}</a>.
          </Text>
        </Paper>
      )}
    </Stack>
  );
}
