import { Badge, Group, Stack, Text, ThemeIcon } from '@mantine/core';
import { IconUsers } from '@tabler/icons-react';
import { Link } from '@/components/link';
import { UserLink } from '@/components/user/user-link';
import { useI18n } from '@/hooks/use-i18n';

/** A team is a domain-scoped participant, not a profile with a negative user ID. */
export function TeamIdentity({ id, name, members = [], udict = {}, canManage = false, linkMembers = true }: {
  id: number;
  name?: string;
  members?: number[];
  udict?: Record<number, any>;
  canManage?: boolean;
  linkMembers?: boolean;
}) {
  const { t } = useI18n();
  const label = name || t('Team');
  return <Group gap="sm" wrap="nowrap" align="flex-start">
    <ThemeIcon variant="light" size={34} radius="md" aria-hidden="true"><IconUsers size={19} /></ThemeIcon>
    <Stack gap={5} style={{ minWidth: 0 }}>
      <Group gap="xs" wrap="wrap">
        {canManage
          ? <Link to="contest_team_detail" params={{ vuid: id }} className="hydro-subtle-link"><Text size="sm" fw={600}>{label}</Text></Link>
          : <Text size="sm" fw={600}>{label}</Text>}
        <Badge size="xs" variant="light">{t('Team Participation')}</Badge>
      </Group>
      <Group gap="xs" wrap="wrap">
        <Text size="xs" c="dimmed">{t('{0} members', members.length)}</Text>
        {members.map((uid) => (
          <UserLink key={uid} user={udict[uid] || { _id: uid, uname: String(uid) }} size="xs" link={linkMembers} />
        ))}
      </Group>
    </Stack>
  </Group>;
}
