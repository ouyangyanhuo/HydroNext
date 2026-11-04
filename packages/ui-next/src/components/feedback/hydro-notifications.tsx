import { notifications, notificationsStore, useNotifications } from '@mantine/notifications';
import {
  IconAlertCircle,
  IconAlertTriangle,
  IconCheck,
  IconInfoCircle,
  IconX,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ButtonBase } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';
import { useNotificationStore } from '@/stores/notification';

function ToastIcon({ color, icon }: { color?: string, icon?: React.ReactNode }) {
  if (icon) return <span className="hydro-toast-icon">{icon}</span>;
  if (color === 'green' || color === 'teal') {
    return (
      <span className="hydro-toast-icon hydro-toast-icon--green" aria-hidden="true">
        <IconCheck size={16} stroke={2.4} />
      </span>
    );
  }
  if (color === 'red') {
    return (
      <span className="hydro-toast-icon hydro-toast-icon--red" aria-hidden="true">
        <IconAlertCircle size={16} stroke={2.2} />
      </span>
    );
  }
  if (color === 'yellow' || color === 'orange') {
    return (
      <span className="hydro-toast-icon hydro-toast-icon--yellow" aria-hidden="true">
        <IconAlertTriangle size={16} stroke={2.2} />
      </span>
    );
  }
  return (
    <span className="hydro-toast-icon hydro-toast-icon--blue" aria-hidden="true">
      <IconInfoCircle size={16} stroke={2.2} />
    </span>
  );
}

interface ToastCardProps {
  item: any;
  index: number;
  effectiveIndex: number;
  isDismissing: boolean;
  activeCount: number;
  onDismiss: (id: string) => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}

function ToastCard({
  item,
  index,
  effectiveIndex,
  isDismissing,
  activeCount,
  onDismiss,
  onMouseEnter,
  onMouseLeave,
}: ToastCardProps) {
  const { t } = useI18n();
  const id = item.id || `toast-${index}`;

  let cardClass = 'hydro-toast-card';
  let position: 'relative' | 'absolute' = 'absolute';
  let transform = '';
  let opacity = 1;
  let zIndex = 1;
  let pointerEvents: 'auto' | 'none' = 'none';

  if (isDismissing) {
    cardClass += ' hydro-toast-card--dismissing';
    transform = 'translateX(-100%) scale(0.95)';
    opacity = 0;
    zIndex = 15;
    if (activeCount === 0 && index === 0) {
      position = 'relative';
    }
  } else if (effectiveIndex === 0) {
    cardClass += ' hydro-toast-card--top';
    position = 'relative';
    transform = 'translateY(0px) scale(1)';
    opacity = 1;
    zIndex = 10;
    pointerEvents = 'auto';
  } else if (effectiveIndex === 1) {
    cardClass += ' hydro-toast-card--second';
    transform = 'translateY(8px) scale(0.96)';
    opacity = 0.85;
    zIndex = 5;
  } else if (effectiveIndex === 2) {
    cardClass += ' hydro-toast-card--third';
    transform = 'translateY(16px) scale(0.92)';
    opacity = 0.65;
    zIndex = 2;
  } else {
    cardClass += ' hydro-toast-card--hidden';
    transform = 'translateY(20px) scale(0.88)';
    opacity = 0;
    zIndex = 0;
  }

  return (
    <div
      className={cardClass}
      style={{
        position,
        transform,
        opacity,
        zIndex,
        pointerEvents,
      }}
      onMouseEnter={effectiveIndex === 0 ? onMouseEnter : undefined}
      onMouseLeave={effectiveIndex === 0 ? onMouseLeave : undefined}
      role="alert"
      aria-live="polite"
    >
      <ToastIcon color={item.color} icon={item.icon} />
      <div className="hydro-toast-body">
        {item.title && <div className="hydro-toast-title">{item.title}</div>}
        {item.message && <div className="hydro-toast-message">{item.message}</div>}
      </div>
      {effectiveIndex === 0 && !isDismissing && (
        <ButtonBase
          type="button"
          className="hydro-toast-close"
          onClick={(e) => {
            e.stopPropagation();
            onDismiss(id);
          }}
          aria-label={t('Close')}
        >
          <IconX size={14} stroke={2} />
        </ButtonBase>
      )}
    </div>
  );
}

export function HydroNotifications() {
  const { t } = useI18n();
  const storeNotifs = useNotificationStore((s) => s.notifications);
  const removeStoreNotif = useNotificationStore((s) => s.remove);

  // Sync legacy useNotificationStore into Mantine's store
  useEffect(() => {
    for (const n of storeNotifs) {
      notifications.show({
        id: n.id,
        title: n.title,
        message: n.message,
        color: n.color,
        autoClose: n.autoClose ?? 4000,
        onClose: () => removeStoreNotif(n.id),
      });
    }
  }, [storeNotifs, removeStoreNotif]);

  const { notifications: list } = useNotifications(notificationsStore);

  // Order with the newest notification first (index 0)
  const items = useMemo(() => [...list].reverse(), [list]);

  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [isHovered, setIsHovered] = useState(false);

  const dismiss = useCallback((id: string) => {
    setDismissingIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
    setTimeout(() => {
      notifications.hide(id);
      setDismissingIds((prev) => {
        if (!prev.has(id)) return prev;
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }, 200);
  }, []);

  // Find the active (non-dismissing) top notification
  const activeItems = useMemo(
    () => items.filter((item) => !dismissingIds.has(item.id || '')),
    [items, dismissingIds],
  );

  const activeTopItem = activeItems[0];
  const activeTopId = activeTopItem?.id;
  const activeTopAutoClose = activeTopItem?.autoClose;

  // Auto-close countdown for the front active notification
  useEffect(() => {
    if (!activeTopId || activeTopAutoClose === false || isHovered) {
      return undefined;
    }
    const duration = typeof activeTopAutoClose === 'number' ? activeTopAutoClose : 4000;
    const timer = setTimeout(() => {
      dismiss(activeTopId);
    }, duration);
    return () => clearTimeout(timer);
  }, [activeTopId, activeTopAutoClose, isHovered, dismiss]);

  if (items.length === 0) return null;

  return (
    <div
      className="hydro-toast-container"
      role="region"
      aria-label={t('Notifications')}
    >
      <div className="hydro-toast-stack">
        {items.map((item, index) => {
          const id = item.id || `toast-${index}`;
          const isDismissing = dismissingIds.has(id);
          const activeIndex = activeItems.findIndex((it) => (it.id || '') === id);

          return (
            <ToastCard
              key={id}
              item={item}
              index={index}
              effectiveIndex={isDismissing ? -1 : activeIndex}
              isDismissing={isDismissing}
              activeCount={activeItems.length}
              onDismiss={dismiss}
              onMouseEnter={() => setIsHovered(true)}
              onMouseLeave={() => setIsHovered(false)}
            />
          );
        })}
      </div>
    </div>
  );
}
