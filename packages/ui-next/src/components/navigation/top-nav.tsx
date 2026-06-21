import { ActionIcon, Avatar, Burger, Button, Drawer, Group, Menu, Stack, Text, Tooltip, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { IconMoon, IconSun } from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import logoUrl from '@/assets/logo.png';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useCurrentUser, useIsLoggedIn } from '@/hooks/use-current-user';
import { useDomain } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';
import { getAvatarUrl } from '@/utils/avatar';
import { DomainSwitcher } from './domain-switcher';

type RootViewTransition = {
  ready: Promise<void>;
  finished: Promise<void>;
};

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => RootViewTransition;
};

function UserMenu() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const domainId = useSessionStore((s) => s.ui.domainId);
  const isSu = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);

  return (
    <Menu shadow="md" width={220} position="bottom-end">
      <Menu.Target>
        <UnstyledButton className="flex items-center gap-2 rounded-md px-2 py-1 transition hover:bg-[var(--hydro-surface-muted)]">
          <Avatar src={getAvatarUrl(user.avatar, 32)} size={32} radius="xl" />
          <Text size="sm" fw={600} className="hidden text-[var(--hydro-text)] sm:block">
            {user.uname}
          </Text>
        </UnstyledButton>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item component={Link} to="user_detail" params={{ uid: user._id }}>
          {t('My Profile')}
        </Menu.Item>
        <Menu.Item component={Link} to="home_settings" params={{ category: 'preference' }}>
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
        <Menu.Divider />
        <Menu.Item component={Link} to="home_domain">
          {t('My Domains')}
        </Menu.Item>
        {isSu && (
          <Menu.Item component={Link} to="manage_dashboard">
            {t('Manage')}
          </Menu.Item>
        )}
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

function ThemeToggle() {
  const { t } = useI18n();
  const theme = useSessionStore((s) => s.theme);
  const setTheme = useSessionStore((s) => s.setTheme);
  const timersRef = useRef<number[]>([]);
  const frameRef = useRef<number | null>(null);
  const [animating, setAnimating] = useState(false);
  const [transition, setTransition] = useState<{
    x: number;
    y: number;
    radius: number;
    targetTheme: 'light' | 'dark';
    expanded: boolean;
  } | null>(null);
  const isDark = theme === 'dark';
  const label = isDark ? t('Switch to light mode') : t('Switch to dark mode');

  useEffect(() => () => {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
  }, []);

  const runFallbackTransition = (x: number, y: number, radius: number, targetTheme: 'light' | 'dark') => {
    setTransition({ x, y, radius, targetTheme, expanded: false });
    frameRef.current = window.requestAnimationFrame(() => {
      setTransition((current) => (current ? { ...current, expanded: true } : current));
    });
    timersRef.current.push(window.setTimeout(() => setTheme(targetTheme), 900));
    timersRef.current.push(window.setTimeout(() => {
      setTransition(null);
      setAnimating(false);
      timersRef.current = [];
    }, 980));
  };

  const toggleTheme = async (event: MouseEvent<HTMLButtonElement>) => {
    const targetTheme = isDark ? 'light' : 'dark';
    if (animating) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTheme(targetTheme);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ) + 48;

    setAnimating(true);
    const transitionDocument = document as ViewTransitionDocument;
    if (!transitionDocument.startViewTransition) {
      runFallbackTransition(x, y, radius, targetTheme);
      return;
    }

    try {
      const viewTransition = transitionDocument.startViewTransition(() => {
        flushSync(() => setTheme(targetTheme));
      });
      await viewTransition.ready;
      const animation = document.documentElement.animate(
        {
          clipPath: [
            `circle(0px at ${x}px ${y}px)`,
            `circle(${radius}px at ${x}px ${y}px)`,
          ],
        },
        {
          duration: 900,
          easing: 'cubic-bezier(.22, 1, .36, 1)',
          pseudoElement: '::view-transition-new(root)',
        } as KeyframeAnimationOptions,
      );
      await animation.finished;
      await viewTransition.finished.catch(() => undefined);
    } catch {
      setTheme(targetTheme);
    } finally {
      setAnimating(false);
    }
  };

  return (
    <>
      <Tooltip label={label} withArrow>
        <ActionIcon
          aria-label={label}
          color={isDark ? 'yellow' : 'hydroTeal'}
          disabled={animating}
          onClick={toggleTheme}
          radius="md"
          size="lg"
          variant="subtle"
          className="relative overflow-hidden transition-colors duration-200 hover:bg-[var(--hydro-surface-muted)]"
        >
          <IconSun
            size={18}
            stroke={2.2}
            className={`absolute transition-all duration-300 ease-out ${
              isDark ? 'rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
            }`}
          />
          <IconMoon
            size={18}
            stroke={2.2}
            className={`absolute transition-all duration-300 ease-out ${
              isDark ? 'rotate-0 scale-100 opacity-100' : '-rotate-90 scale-0 opacity-0'
            }`}
          />
        </ActionIcon>
      </Tooltip>
      {transition && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[9999] h-0.5 w-0.5 rounded-full transition-transform duration-[900ms] ease-out"
          style={{
            background: transition.targetTheme === 'dark' ? '#0b1114' : '#eef3f6',
            transform: `translate(${transition.x}px, ${transition.y}px) translate(-50%, -50%) scale(${transition.expanded ? transition.radius : 0})`,
          }}
        />
      )}
    </>
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
  const serverName = useSessionStore((s) => s.ui.serverName);
  const { name } = usePageData();
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const isSu = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);

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
                  {serverName || 'Hydro'}
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
            <ThemeToggle />
            <DomainSwitcher />
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

      <Drawer opened={opened} onClose={close} title={serverName || 'Hydro'} size="xs">
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
                <Button component={Link} to="home_domain" variant="subtle" fullWidth justify="flex-start" onClick={close}>
                  {t('My Domains')}
                </Button>
                {isSu && (
                  <Button component={Link} to="manage_dashboard" variant="subtle" fullWidth justify="flex-start" onClick={close}>
                    {t('Manage')}
                  </Button>
                )}
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
