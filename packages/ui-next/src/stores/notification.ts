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

function createNotificationId() {
  return globalThis.crypto?.randomUUID?.() || `notification-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export const useNotificationStore = create<NotificationStore>((set) => ({
  notifications: [],
  add: (notification) =>
    set((state) => ({
      notifications: [
        ...state.notifications,
        { ...notification, id: createNotificationId() },
      ],
    })),
  remove: (id) =>
    set((state) => ({
      notifications: state.notifications.filter((n) => n.id !== id),
    })),
}));
