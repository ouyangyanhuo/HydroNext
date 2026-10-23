import { Text } from '@mantine/core';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';
import { formatUserName } from '@/utils/user-name';

interface UserLinkProps {
  user: { _id: number, uname: string, displayName?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  link?: boolean;
}

export function UserLink({ user, size = 'sm', link = true }: UserLinkProps) {
  const { t } = useI18n();

  if (!user || user._id <= 0) {
    return <Text size={size} c="dimmed">{t('Unknown')}</Text>;
  }

  const name = (
    <Text size={size} fw="var(--hydro-weight-medium)" className={link ? 'hover:underline' : undefined}>
      {formatUserName(user)}
    </Text>
  );
  return link ? <Link to="user_detail" params={{ uid: user._id }} className="no-underline">{name}</Link> : name;
}
