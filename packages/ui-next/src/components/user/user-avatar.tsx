import { Avatar, type AvatarProps } from '@mantine/core';
import { Link } from '@/components/link';

interface UserAvatarProps extends Omit<AvatarProps, 'src'> {
    user: { _id: number; uname: string; avatar?: string };
    link?: boolean;
}

export function UserAvatar({ user, link = true, ...props }: UserAvatarProps) {
    const avatar = (
        <Avatar
            src={user.avatar}
            alt={user.uname}
            radius="xl"
            {...props}
        >
            {user.uname?.[0]?.toUpperCase()}
        </Avatar>
    );

    if (link && user._id > 0) {
        return (
            <Link to="user_detail" params={{ uid: user._id }} className="no-underline">
                {avatar}
            </Link>
        );
    }

    return avatar;
}
