import { Text } from '@mantine/core';
import { Link } from '@/components/link';

interface UserLinkProps {
    user: { _id: number; uname: string };
    size?: 'xs' | 'sm' | 'md' | 'lg';
}

export function UserLink({ user, size = 'sm' }: UserLinkProps) {
    if (!user || user._id <= 0) {
        return <Text size={size} c="dimmed">Unknown</Text>;
    }

    return (
        <Link to="user_detail" params={{ uid: user._id }} className="no-underline">
            <Text size={size} fw={500} className="hover:underline">
                {user.uname}
            </Text>
        </Link>
    );
}
