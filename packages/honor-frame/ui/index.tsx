/* eslint-disable react-refresh/only-export-components -- Addon setup and slot definitions are registration modules. */
import './style.css';

import {
  Button, Link, type PluginDefinition, PRIV, registerUserFields, useHasPriv, useI18n,
} from '@hydrooj/ui-next';
import { Menu, Tabs } from '@mantine/core';
import { IconUserCircle } from '@tabler/icons-react';
import { FramedAvatar } from './components/user/framed-avatar';
import { OwnedHonorFrames } from './components/user/owned-honor-frames';

function AccountEntry({ variant, onClose }: any) {
  const { t } = useI18n();
  const allowed = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  if (!allowed) return null;
  return variant === 'mobile'
    ? <Button component={Link} to="manage_honor_frames" variant="subtle" fullWidth justify="flex-start" onClick={onClose}>
      {t('Avatar frame management')}
    </Button>
    : <Menu.Item component={Link} to="manage_honor_frames">{t('Avatar frame management')}</Menu.Item>;
}

function NavigationEntry() {
  const { t } = useI18n();
  return <Link to="home_honor_frames" className="hydro-settings-nav__item">
    <IconUserCircle size={18} stroke={1.8} /><span>{t('Honor avatar frame')}</span>
  </Link>;
}

function ProfileTab() {
  const { t } = useI18n();
  return <Tabs.Tab value="frames">{t('Owned honor frames')}</Tabs.Tab>;
}

function ProfilePanel({ user, tab }: any) {
  return <Tabs.Panel value="frames" pt="md">
    {tab === 'frames' && <OwnedHonorFrames key={user._id} uid={user._id} avatar={user.avatar} />}
  </Tabs.Panel>;
}

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  api.registerPage('manage_honor_frames', () => import('./pages/manage_honor_frames'), { title: 'Manage honor frames' });
  api.registerPage('manage_honor_frame_upload', () => import('./pages/manage_honor_frame_upload'), { title: 'Upload frame' });
  api.registerPage('manage_honor_frame_owners', () => import('./pages/manage_honor_frame_owners'), { title: 'Frame owners' });
  api.registerPage('home_honor_frames', () => import('./pages/home_honor_frames'), { title: 'Honor avatar frame' });
  const cleanups = [
    registerUserFields(['honorFrame']),
    api.replace('component:avatar-view', ({ user, wrapperClassName, ...props }: any) => (
      <FramedAvatar {...props} frameClassName={wrapperClassName} frame={user?.honorFrame} />
    )),
    api.after('component:account-menu-extras', AccountEntry),
    api.after('component:settings-navigation-extras', NavigationEntry),
    api.after('component:profile-tab-extras', ProfileTab),
    api.after('component:profile-panel-extras', ProfilePanel),
  ];
  return () => { cleanups.reverse().forEach((dispose) => dispose()); };
}
