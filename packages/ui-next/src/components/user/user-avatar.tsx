import { Link } from '@/components/link';
import { getAvatarUrl } from '@/utils/avatar';
import type { HonorFrame } from '@/utils/honor-frame';
import { formatUserName } from '@/utils/user-name';
import { FramedAvatar, type FramedAvatarProps } from './framed-avatar';

interface UserAvatarProps extends Omit<FramedAvatarProps, 'src' | 'frame'> {
  user: { _id: number, uname: string, displayName?: string, avatar?: string, avatarUrl?: string, honorFrame?: HonorFrame | null };
  link?: boolean;
}

export function UserAvatar({ user, link = true, ...props }: UserAvatarProps) {
  const avatar = (
    <FramedAvatar
      src={user.avatarUrl || getAvatarUrl(user.avatar || '', typeof props.size === 'number' ? props.size : 64)}
      frame={user.honorFrame}
      alt={formatUserName(user)}
      radius="xl"
      {...props}
    >
      {user.uname?.[0]?.toUpperCase()}
    </FramedAvatar>
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
