import { useEffect } from 'react';
import { notifications } from '@mantine/notifications';
import { useNotificationStore } from '@/stores/notification';

export function HydroNotifications() {
    const notifs = useNotificationStore((s) => s.notifications);
    const remove = useNotificationStore((s) => s.remove);

    useEffect(() => {
        for (const n of notifs) {
            notifications.show({
                id: n.id,
                title: n.title,
                message: n.message,
                color: n.color,
                autoClose: n.autoClose ?? 5000,
                onClose: () => remove(n.id),
            });
        }
    }, [notifs, remove]);

    return null;
}
