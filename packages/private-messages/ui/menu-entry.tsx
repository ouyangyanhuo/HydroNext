import {
  Button, Link, PRIV, useHasPriv, useI18n, useSessionStore,
} from '@hydrooj/ui-next';
import { Menu } from '@mantine/core';

export function MessagesMenuEntry({ variant, onClose }: { variant?: string, onClose?: () => void }) {
  const { t } = useI18n();
  const loggedIn = useHasPriv(PRIV.PRIV_USER_PROFILE);
  // The server advertises this only after the addon has registered its route.
  const visible = useSessionStore((state) => state.ui.privateMessagesEntryVisible === true);
  if (!loggedIn || !visible) return null;
  return variant === 'mobile'
    ? <Button component={Link} to="home_messages" variant="subtle" fullWidth justify="flex-start" onClick={onClose}>
      {t('Messages')}
    </Button>
    : <Menu.Item component={Link} to="home_messages">{t('Messages')}</Menu.Item>;
}
