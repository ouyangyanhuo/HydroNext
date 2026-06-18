import { Avatar, Group, Paper, Stack, Text } from '@mantine/core';
import { EmptyState } from '@/components/common/empty-state';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

export default function HomeMessagesPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const messages = args.messages || [];
  const udict = args.udict || {};

  return (
    <Stack gap="lg">
      <PageHeader title={t('Messages')} />
      {messages.length === 0 ? (
        <EmptyState message={t('No messages')} />
      ) : (
        <Paper withBorder p="lg">
          <Stack gap="md">
            {messages.map((m: any) => (
              <Group key={m._id} align="flex-start" gap="sm">
                <Avatar src={udict[m.from]?.avatar} size="sm" radius="xl" />
                <div className="flex-1">
                  <Group justify="space-between">
                    <Text size="sm" fw={500}>{udict[m.from]?.uname || m.from}</Text>
                    <TimeDisplay date={m._id} format="relative" />
                  </Group>
                  <Text size="sm" mt={4}>{m.content}</Text>
                </div>
              </Group>
            ))}
          </Stack>
        </Paper>
      )}
    </Stack>
  );
}
