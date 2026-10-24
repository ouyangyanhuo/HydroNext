import { Link } from '@/components/link';
import { avatarPixelSize, getAvatarUrl } from '@/utils/avatar';
import { formatUserName } from '@/utils/user-name';
import { AvatarView, type AvatarViewProps } from './avatar-view';

interface UserAvatarProps extends Omit<AvatarViewProps, 'src' | 'user'> {
  user: { _id: number, uname: string, displayName?: string, avatar?: string, avatarUrl?: string, [key: string]: any };
  link?: boolean;
}

export function UserAvatar({ user, link = true, ...props }: UserAvatarProps) {
  const avatar = (
    <AvatarView
      src={user.avatarUrl || getAvatarUrl(user.avatar || '', Math.ceil((avatarPixelSize(props.size) || 64) * 2))}
      user={user}
      alt={formatUserName(user)}
      radius="xl"
      {...props}
    >
      {user.uname?.[0]?.toUpperCase()}
    </AvatarView>
  );

  if (link && user._id > 0) {
    return (
      <Link to="user_detail" params={{ uid: user._id }} className="hydro-user-avatar-link no-underline">
        {avatar}
      </Link>
    );
  }

  return avatar;
}
