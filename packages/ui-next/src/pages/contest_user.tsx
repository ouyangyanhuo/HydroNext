import { getAvatarUrl } from '@/utils/avatar';
import { Avatar, Button, Checkbox, Group, Modal, Paper, Stack, Table, Text, TextInput } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function canResume(tdoc: any, tsdoc: any) {
  if (!tsdoc.endAt || !tdoc.endAt) return false;
  const endAt = new Date(tdoc.endAt).getTime();
  const userEndAt = new Date(tsdoc.endAt).getTime();
  if (userEndAt >= endAt || endAt <= Date.now()) return false;
  if (!tdoc.duration || !tsdoc.startAt) return true;
  return new Date(tsdoc.startAt).getTime() + Number(tdoc.duration) * 3600000 > Date.now();
}

export default function ContestUserPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const tdoc = args.tdoc || {};
  const udict = args.udict || {};
  const tsdocs = args.tsdocs || [];
  const tid = tdoc.docId || tdoc._id;
  const [opened, setOpened] = useState(false);
  const [uidsText, setUidsText] = useState('');
  const [unrank, setUnrank] = useState(false);
  const [loading, setLoading] = useState('');

  const post = async (payload: Record<string, any>, successMessage: string) => {
    setLoading(payload.operation);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Failed')));
      notifications.show({ title: successMessage, message: '', color: 'green' });
      navigate(window.location.pathname + window.location.search);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setLoading('');
    }
  };

  const addUser = async () => {
    const uids = uidsText.split(/[,\s]+/).map((item) => Number(item)).filter((uid) => Number.isSafeInteger(uid) && uid > 0);
    if (!uids.length) {
      notifications.show({ title: t('Users'), message: '', color: 'red' });
      return;
    }
    await post({ operation: 'add_user', uids, unrank }, t('User added.'));
    setOpened(false);
    setUidsText('');
    setUnrank(false);
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Attendee Manage')} - ${tdoc.title}`}>
        <Group gap="xs">
          <Button size="xs" onClick={() => setOpened(true)}>{t('Add User')}</Button>
          <Button component={Link} to="contest_manage" params={{ tid }} size="xs" variant="subtle">{t('Contest Management')}</Button>
        </Group>
      </PageHeader>

      <Paper withBorder className="overflow-hidden">
        <Table striped highlightOnHover>
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t('User ID')}</Table.Th>
              <Table.Th>{t('Username')}</Table.Th>
              <Table.Th>{t('Begin Time')}</Table.Th>
              <Table.Th>{t('End Time')}</Table.Th>
              <Table.Th>{t('Rank')}</Table.Th>
              <Table.Th>{t('Actions')}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {tsdocs.map((tsdoc: any) => {
              const udoc = udict[tsdoc.uid] || {};
              return (
                <Table.Tr key={tsdoc.uid}>
                  <Table.Td><Text size="xs" ff="monospace">{tsdoc.uid}</Text></Table.Td>
                  <Table.Td>
                    <Group gap="xs" wrap="nowrap">
                      <Avatar src={getAvatarUrl(udoc.avatar)} size="xs" radius="xl" />
                      <Link to="user_detail" params={{ uid: tsdoc.uid }} className="no-underline hover:underline">
                        <Text size="sm">{udoc.uname || tsdoc.uid}</Text>
                      </Link>
                    </Group>
                  </Table.Td>
                  <Table.Td><TimeDisplay date={tsdoc.startAt || tdoc.beginAt} format="absolute" size="xs" /></Table.Td>
                  <Table.Td><TimeDisplay date={tsdoc.endAt || tdoc.endAt} format="absolute" size="xs" /></Table.Td>
                  <Table.Td><Text size="xs">{tsdoc.unrank ? t('UnRank') : t('Rank')}</Text></Table.Td>
                  <Table.Td>
                    <Group gap="xs">
                      <Button size="compact-xs" variant="subtle" loading={loading === 'rank'} onClick={() => post({ operation: 'rank', uid: tsdoc.uid }, t('Ranking status updated.'))}>
                        {tsdoc.unrank ? t('Rank') : t('UnRank')}
                      </Button>
                      {canResume(tdoc, tsdoc) && (
                        <Button size="compact-xs" variant="light" loading={loading === 'resume'} onClick={() => post({ operation: 'resume', uid: tsdoc.uid }, t('Contest resumed.'))}>
                          {t('Resume')}
                        </Button>
                      )}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </Paper>

      <Modal opened={opened} onClose={() => setOpened(false)} title={t('Add User')}>
        <Stack gap="md">
          <TextInput
            label={t('Users')}
            description={t('Input user IDs separated by comma or space.')}
            value={uidsText}
            onChange={(event) => setUidsText(event.currentTarget.value)}
            placeholder="1001, 1002"
          />
          <Checkbox label={t('UnRank')} checked={unrank} onChange={(event) => setUnrank(event.currentTarget.checked)} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setOpened(false)}>{t('Cancel')}</Button>
            <Button onClick={addUser} loading={loading === 'add_user'}>{t('Add User')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
