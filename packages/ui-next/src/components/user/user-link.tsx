import { Text } from '@mantine/core';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';
import { formatUserName } from '@/utils/user-name';

export interface UserLinkProps {
  user: { _id: number, uname: string, displayName?: string };
  size?: 'xs' | 'sm' | 'md' | 'lg';
  link?: boolean;
  truncate?: boolean;
  maxWidth?: number | string;
  className?: string;
}

export function UserLink({
  user,
  size = 'sm',
  link = true,
  truncate = false,
  maxWidth,
  className,
}: UserLinkProps) {
  const { t } = useI18n();

  if (!user || user._id <= 0) {
    return (
      <Text
        size={size}
        c="dimmed"
        truncate={truncate ? 'end' : undefined}
        maw={maxWidth}
        className={className}
      >
        {t('Unknown')}
      </Text>
    );
  }

  const fullName = formatUserName(user);
  const text = (
    <Text
      size={size}
      fw="var(--hydro-weight-medium)"
      truncate={truncate ? 'end' : undefined}
      maw={maxWidth}
      title={truncate ? fullName : undefined}
      className={[
        link ? 'hover:underline' : '',
        truncate ? 'truncate whitespace-nowrap' : '',
        className || '',
      ].filter(Boolean).join(' ')}
    >
      {fullName}
    </Text>
  );

  return link ? (
    <Link
      to="user_detail"
      params={{ uid: user._id }}
      className={`no-underline${truncate ? ' inline-block max-w-full truncate whitespace-nowrap align-bottom' : ''}`}
      title={fullName}
    >
      {text}
    </Link>
  ) : text;
}
