import {
  Button, Link, PRIV, useHasPriv, useI18n, useSessionStore,
} from '@hydrooj/ui-next';
import { Menu } from '@mantine/core';
import { IconMessages } from '@tabler/icons-react';

export function MessagesMenuEntry({ variant, onClose }: { variant?: string, onClose?: () => void }) {
  const { t } = useI18n();
  const loggedIn = useHasPriv(PRIV.PRIV_USER_PROFILE);
  // The server advertises this only after the addon has registered its route.
  const visible = useSessionStore((state) => state.ui.privateMessagesEntryVisible === true);
  if (!loggedIn || !visible) return null;
  const icon = <IconMessages size={16} aria-hidden="true" />;
  return variant === 'mobile'
    ? <Button component={Link} to="home_messages" variant="subtle" fullWidth justify="flex-start" leftSection={icon} onClick={onClose}>
      {t('Messages')}
    </Button>
    : <Menu.Item component={Link} to="home_messages" leftSection={icon}>{t('Messages')}</Menu.Item>;
}
