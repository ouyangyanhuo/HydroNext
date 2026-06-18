import { getAvatarUrl } from '@/utils/avatar';
import { Avatar, Button, Group, Paper, Stack, Table, Text } from '@mantine/core';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

export default function DomainJoinApplicationsPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const applications = args.applications || [];
  const udict = args.udict || {};

  const handleDecision = async (uid: number, decision: string) => {
    try {
      await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ uid, operation: decision }),
      });
      navigate(window.location.href);
    } catch { /* ignore */ }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Join Applications')} />
      {applications.length === 0 ? (
        <Text c="dimmed" ta="center" py="xl">{t('No pending applications')}</Text>
      ) : (
        <Paper withBorder>
          <Table striped>
            <Table.Thead><Table.Tr><Table.Th>{t('User')}</Table.Th><Table.Th>{t('Time')}</Table.Th><Table.Th>{t('Action')}</Table.Th></Table.Tr></Table.Thead>
            <Table.Tbody>
              {applications.map((a: any) => {
                const u = udict[a.uid] || {};
                return (
                  <Table.Tr key={a.uid}>
                    <Table.Td><Group gap="xs"><Avatar src={getAvatarUrl(u.avatar)} size="xs" radius="xl" /><Text size="sm">{u.uname || a.uid}</Text></Group></Table.Td>
                    <Table.Td><TimeDisplay date={a._id} format="relative" /></Table.Td>
                    <Table.Td>
                      <Group gap="xs">
                        <Button size="xs" color="green" onClick={() => handleDecision(a.uid, 'accept')}>{t('Accept')}</Button>
                        <Button size="xs" color="red" variant="light" onClick={() => handleDecision(a.uid, 'reject')}>{t('Reject')}</Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
