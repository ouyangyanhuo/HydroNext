import { create } from 'zustand';

export interface Notification {
    id: string;
    title: string;
    message?: string;
    color: 'green' | 'red' | 'yellow' | 'blue';
    autoClose?: number;
}

interface NotificationStore {
    notifications: Notification[];
    add(notification: Omit<Notification, 'id'>): void;
    remove(id: string): void;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
    notifications: [],
    add: (notification) =>
        set((state) => ({
            notifications: [
                ...state.notifications,
                { ...notification, id: crypto.randomUUID() },
            ],
        })),
    remove: (id) =>
        set((state) => ({
            notifications: state.notifications.filter((n) => n.id !== id),
        })),
}));
