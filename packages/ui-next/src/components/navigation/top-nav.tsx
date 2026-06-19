import { Avatar, Burger, Button, Drawer, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { useEffect, useRef, useState } from 'react';
import logoUrl from '@/assets/logo.png';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useCurrentUser, useIsLoggedIn } from '@/hooks/use-current-user';
import { useDomain } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { getAvatarUrl } from '@/utils/avatar';
import { LanguageMenu } from './language-menu';

function UserMenu() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const domainId = useSessionStore((s) => s.ui.domainId);

  return (
    <Menu shadow="md" width={220} position="bottom-end">
      <Menu.Target>
        <UnstyledButton className="flex h-9 items-center gap-2 rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface)] px-2 shadow-[var(--hydro-shadow-sm)] transition hover:border-[var(--hydro-border-strong)]">
          <Avatar src={getAvatarUrl(user.avatar, 28)} size={28} radius="xl" />
          <Text size="sm" fw={650} className="max-w-32 truncate text-[var(--hydro-text)]">
            {user.uname}
          </Text>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="user_detail" params={{ uid: user._id }}>
          {t('My Profile')}
        </Menu.Item>
        <Menu.Item component={Link} to="home_settings">
          {t('Settings')}
        </Menu.Item>
        <Menu.Item component={Link} to="home_security">
          {t('Security')}
        </Menu.Item>
        <Menu.Item component={Link} to="home_messages">
          {t('Messages')}
        </Menu.Item>
        <Menu.Item component={Link} to="home_files">
          {t('My Files')}
        </Menu.Item>
        {user.priv & (1 << 0) ? (
          <>
            <Menu.Divider />
            <Menu.Item component={Link} to="domain_dashboard" params={{ domainId }}>
              {t('Domain Manage')}
            </Menu.Item>
          </>
        ) : null}
        <Menu.Divider />
        <Menu.Item component={Link} to="user_logout" color="red">
          {t('Logout')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

function GuestMenu() {
  const { t } = useI18n();

  return (
    <Group gap="xs">
      <Button component={Link} to="user_login" variant="subtle">
        {t('Login')}
      </Button>
      <Button component={Link} to="user_register">
        {t('Register')}
      </Button>
    </Group>
  );
}

const NAV_ITEMS = [
  { to: 'homepage', label: 'Home' },
  { to: 'problem_main', label: 'Problems' },
  { to: 'contest_main', label: 'Contests' },
  { to: 'training_main', label: 'Training' },
  { to: 'record_main', label: 'Records' },
] as const;

export function TopNav() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const isLoggedIn = useIsLoggedIn();
  const domain = useDomain();
  const { name } = usePageData();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });

  useEffect(() => {
    const activeTab = tabRefs.current.get(name);
    const container = containerRef.current;
    if (activeTab && container) {
      const cr = container.getBoundingClientRect();
      const tr = activeTab.getBoundingClientRect();
      setIndicator({ left: tr.left - cr.left, width: tr.width });
    }
  }, [name]);

  return (
    <>
      <div className="border-b border-[var(--hydro-border)] bg-[var(--hydro-nav-bg)] backdrop-blur-xl">
        <div className="hydro-container flex h-16 items-center justify-between">
          <Group gap="lg" wrap="nowrap">
            <Link to="homepage" className="group flex min-w-0 items-center gap-3 no-underline">
              <img src={logoUrl} alt="" className="h-11 w-11 shrink-0 object-contain" />
              <span className="min-w-0">
                <span className="block truncate text-base font-black leading-tight text-[var(--hydro-text)]">
                  {domain.name || 'Hydro'}
                </span>
                <span className="block text-[11px] font-semibold uppercase text-[var(--hydro-text-muted)]">
                  {t('Online Judge')}
                </span>
              </span>
            </Link>
            <div ref={containerRef} className="relative hidden lg:flex">
              {NAV_ITEMS.map((item) => (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  ref={(el) => { if (el) tabRefs.current.set(item.to, el); }}
                  variant="subtle"
                  color={name === item.to ? 'hydroTeal' : 'gray'}
                  className={
                    name === item.to
                      ? 'text-[var(--hydro-primary)]'
                      : 'text-[var(--hydro-text)] hover:bg-[var(--hydro-surface-muted)]'
                  }
                >
                  {t(item.label)}
                </Button>
              ))}
              <div
                className="absolute bottom-0 h-[3px] rounded-full bg-[var(--hydro-primary)] transition-all duration-300 ease-out"
                style={{ left: indicator.left, width: indicator.width }}
              />
            </div>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <LanguageMenu />
            <div className="hidden md:block">
              {isLoggedIn ? <UserMenu /> : <GuestMenu />}
            </div>
            <Burger
              opened={opened}
              onClick={toggle}
              className="lg:hidden"
              size="sm"
            />
          </Group>
        </div>
      </div>

      <Drawer opened={opened} onClose={close} title={domain.name || 'Hydro'} size="xs">
        <Stack gap="xs">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.to}
              component={Link}
              to={item.to}
              variant={name === item.to ? 'filled' : 'subtle'}
              fullWidth
              justify="flex-start"
              onClick={close}
            >
              {t(item.label)}
            </Button>
          ))}
          <div className="border-t border-[var(--hydro-border)] pt-2 mt-2">
            {isLoggedIn ? (
              <>
                <Button component={Link} to="user_detail" params={{ uid: useSessionStore.getState().user._id }} variant="subtle" fullWidth justify="flex-start" onClick={close}>
                  {t('My Profile')}
                </Button>
                <Button component={Link} to="home_settings" variant="subtle" fullWidth justify="flex-start" onClick={close}>
                  {t('Settings')}
                </Button>
                <Button component={Link} to="user_logout" variant="subtle" color="red" fullWidth justify="flex-start" onClick={close}>
                  {t('Logout')}
                </Button>
              </>
            ) : (
              <>
                <Button component={Link} to="user_login" variant="subtle" fullWidth justify="flex-start" onClick={close}>
                  {t('Login')}
                </Button>
                <Button component={Link} to="user_register" fullWidth justify="flex-start" onClick={close}>
                  {t('Register')}
                </Button>
              </>
            )}
          </div>
        </Stack>
      </Drawer>
    </>
  );
}
