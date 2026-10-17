import { Burger, ColorInput, Drawer, Group, Menu, Popover, Stack, Text, Tooltip } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import {
  IconCheck, IconMoon, IconPalette, IconRestore, IconSun,
} from '@tabler/icons-react';
import type { MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import logoUrl from '@/assets/logo.png';
import { ActionIcon, Button, UnstyledButton } from '@/components/common/button';
import { Link } from '@/components/link';
import { UserAvatar } from '@/components/user/user-avatar';
import { usePageData } from '@/context/page-data';
import { useCurrentUser, useIsLoggedIn } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { PERM, PRIV, useHasPerm, useHasPriv } from '@/hooks/use-permission';
import { getPageMetadata } from '@/registry/page-metadata';
import { type ThemeMode, useSessionStore } from '@/stores/session';
import { ACCENT_PRESETS, DEFAULT_ACCENT, PRESET_KEYS } from '@/styles/accent-colors';
import { formatUserName } from '@/utils/user-name';
import { DomainSwitcher } from './domain-switcher';

interface RootViewTransition {
  ready: Promise<void>;
  finished: Promise<void>;
  skipTransition?: () => void;
}

type ViewTransitionDocument = Document & {
  startViewTransition?: (callback: () => void) => RootViewTransition;
};

function UserMenu() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const isSu = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const isRoot = useHasPriv(PRIV.PRIV_ALL);

  return (
    <Menu shadow="md" width={220} position="bottom-end" classNames={{ dropdown: 'hydro-topbar-dropdown' }}>
      <Menu.Target>
        <UnstyledButton
          className="hydro-topbar-user-button"
          px={10}
          py={6}
          aria-label={formatUserName(user)}
        >
          <UserAvatar user={user} size={32} link={false} shape="circle" loading="eager" />
          <Text size="sm" fw="var(--hydro-weight-semibold)" className="hydro-topbar-user-name" c="var(--hydro-text)">
            {formatUserName(user)}
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
        {isRoot && <Menu.Item component={Link} to="home_files">
          {t('My Files')}
        </Menu.Item>}
        <Menu.Divider />
        <Menu.Item component={Link} to="home_domain">
          {t('My Domains')}
        </Menu.Item>
        {isSu && (
          <Menu.Item component={Link} to="manage_honor_frames">
            {t('Avatar frame management')}
          </Menu.Item>
        )}
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
  const registrationEnabled = useSessionStore((s) => s.ui.registrationEnabled !== false);

  return (
    <Group gap="xs">
      <Button component={Link} to="user_login" variant={registrationEnabled ? 'subtle' : 'filled'}>{t('Login')}</Button>
      {registrationEnabled && <Button component={Link} to="user_register" variant="filled">{t('Register')}</Button>}
    </Group>
  );
}

function ThemeToggle() {
  const { t } = useI18n();
  const theme = useSessionStore((s) => s.theme);
  const setTheme = useSessionStore((s) => s.setTheme);
  const busyRef = useRef(false);
  const mountedRef = useRef(true);
  const timersRef = useRef<number[]>([]);
  const frameRef = useRef<number | null>(null);
  const viewTransitionRef = useRef<RootViewTransition | null>(null);
  const animationRef = useRef<Animation | null>(null);
  const [animating, setAnimating] = useState(false);
  const [transition, setTransition] = useState<{
    x: number;
    y: number;
    radius: number;
    targetTheme: ThemeMode;
    expanded: boolean;
  } | null>(null);
  const isDark = theme === 'dark';
  const label = t(isDark ? 'Switch to light mode' : 'Switch to dark mode');

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      if (frameRef.current != null) window.cancelAnimationFrame(frameRef.current);
      animationRef.current?.cancel();
      viewTransitionRef.current?.skipTransition?.();
    };
  }, []);

  const toggleTheme = async (event: MouseEvent<HTMLButtonElement>) => {
    if (busyRef.current) return;
    const targetTheme = useSessionStore.getState().theme === 'dark' ? 'light' : 'dark';
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTheme(targetTheme);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y)) + 48;
    busyRef.current = true;
    setAnimating(true);
    const transitionDocument = document as ViewTransitionDocument;
    if (!transitionDocument.startViewTransition) {
      setTransition({ x, y, radius, targetTheme, expanded: false });
      frameRef.current = window.requestAnimationFrame(() => {
        setTransition((current) => current ? { ...current, expanded: true } : current);
      });
      timersRef.current.push(window.setTimeout(() => setTheme(targetTheme), 690));
      timersRef.current.push(window.setTimeout(() => {
        setTransition(null);
        setAnimating(false);
        busyRef.current = false;
        timersRef.current = [];
      }, 760));
      return;
    }
    try {
      const viewTransition = transitionDocument.startViewTransition(() => {
        if (mountedRef.current) flushSync(() => setTheme(targetTheme));
      });
      viewTransitionRef.current = viewTransition;
      const finished = viewTransition.finished.catch(() => undefined);
      await viewTransition.ready;
      if (!mountedRef.current) return;
      const animation = document.documentElement.animate({
        clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`],
      }, {
        duration: 720,
        easing: 'cubic-bezier(.4, 0, .2, 1)',
        pseudoElement: '::view-transition-new(root)',
      } as KeyframeAnimationOptions);
      animationRef.current = animation;
      await animation.finished;
      await finished;
    } catch {
      if (mountedRef.current) setTheme(targetTheme);
    } finally {
      animationRef.current = null;
      viewTransitionRef.current = null;
      busyRef.current = false;
      if (mountedRef.current) setAnimating(false);
    }
  };

  return (
    <>
      <Tooltip label={label} withArrow>
        <ActionIcon
          aria-label={label}
          onClick={toggleTheme}
          disabled={animating}
          color={isDark ? 'yellow' : 'hydroTeal'}
          radius="md"
          size="lg"
          variant="subtle"
          className="relative overflow-hidden hover:bg-[var(--hydro-surface-muted)]"
        >
          <IconSun
            size={18}
            stroke={2}
            aria-hidden="true"
            className={`absolute transition-[transform,opacity] duration-200 motion-reduce:transition-none ${
              isDark ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-0 opacity-0'
            }`}
          />
          <IconMoon
            size={18}
            stroke={2}
            aria-hidden="true"
            className={`absolute transition-[transform,opacity] duration-200 motion-reduce:transition-none ${
              isDark ? '-rotate-90 scale-0 opacity-0' : 'rotate-0 scale-100 opacity-100'
            }`}
          />
        </ActionIcon>
      </Tooltip>
      {transition && (
        <div
          aria-hidden="true"
          className="pointer-events-none fixed left-0 top-0 z-[9999] h-0.5 w-0.5 rounded-full transition-transform duration-[720ms]"
          style={{
            background: transition.targetTheme === 'dark' ? '#090d11' : '#eef3f6',
            transform: `translate(${transition.x}px, ${transition.y}px) translate(-50%, -50%) scale(${transition.expanded ? transition.radius : 0})`,
            transitionTimingFunction: 'cubic-bezier(.4, 0, .2, 1)',
          }}
        />
      )}
    </>
  );
}

function AccentColorPicker() {
  const { t } = useI18n();
  const accentColor = useSessionStore((s) => s.accentColor);
  const setAccentColor = useSessionStore((s) => s.setAccentColor);
  const [opened, { toggle, close }] = useDisclosure(false);
  const isPreset = PRESET_KEYS.includes(accentColor);

  return (
    <Popover
      opened={opened}
      onChange={close}
      position="bottom-end"
      withArrow
      shadow="md"
      closeOnClickOutside
      classNames={{ dropdown: 'hydro-topbar-dropdown' }}
    >
      <Popover.Target>
        <Tooltip label={t('Theme color')} withArrow>
          <ActionIcon
            aria-label={t('Theme color')}
            onClick={toggle}
            radius="md"
            size="lg"
            variant="subtle"
            className="hover:bg-[var(--hydro-surface-muted)]"
          >
            <IconPalette size={18} stroke={2.2} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <Text size="xs" fw="var(--hydro-weight-semibold)" className="text-[var(--hydro-text-muted)]">
              {t('Preset themes')}
            </Text>
            {accentColor !== DEFAULT_ACCENT && (
              <Tooltip label={t('Reset')} withArrow>
                <ActionIcon
                  size="sm"
                  radius="sm"
                  variant="subtle"
                  color="gray"
                  onClick={() => setAccentColor(DEFAULT_ACCENT)}
                >
                  <IconRestore size={14} stroke={2} />
                </ActionIcon>
              </Tooltip>
            )}
          </div>
          <Group gap="sm">
            {PRESET_KEYS.map((key) => {
              const scheme = ACCENT_PRESETS[key];
              const isActive = accentColor === key;
              return (
                <Tooltip key={key} label={t(scheme.name)} withArrow>
                  <UnstyledButton
                    onClick={() => setAccentColor(key)}
                    className="relative flex h-8 w-8 items-center justify-center rounded-full transition-transform duration-150 hover:scale-110"
                    style={{ background: scheme.light.primary }}
                  >
                    {isActive && (
                      <IconCheck size={14} color="white" stroke={3} />
                    )}
                  </UnstyledButton>
                </Tooltip>
              );
            })}
          </Group>
          <div className="border-t border-[var(--hydro-border)] pt-3">
            <Text size="xs" fw="var(--hydro-weight-semibold)" className="mb-2 text-[var(--hydro-text-muted)]">
              {t('Custom color')}
            </Text>
            <ColorInput
              value={isPreset ? ACCENT_PRESETS[accentColor].light.primary : accentColor}
              onChange={(value) => setAccentColor(value)}
              format="hex"
              size="xs"
              swatches={[]}
              withPicker
              withEyeDropper={false}
              popoverProps={{ withinPortal: false }}
            />
          </div>
        </div>
      </Popover.Dropdown>
    </Popover>
  );
}

const NAV_ITEMS = [
  { to: 'homepage', label: 'Home' },
  { to: 'problem_main', label: 'Problems' },
  { to: 'contest_main', label: 'Contests' },
  { to: 'training_main', label: 'Training' },
  { to: 'record_main', label: 'Records' },
  { to: 'ranking', label: 'Ranking' },
] as const;

export function TopNav() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const isLoggedIn = useIsLoggedIn();
  const serverName = useSessionStore((s) => s.ui.serverName);
  const registrationEnabled = useSessionStore((s) => s.ui.registrationEnabled !== false);
  const { name } = usePageData();
  const activeNav = getPageMetadata(name).nav;
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const [indicator, setIndicator] = useState({ left: 0, width: 0 });
  const isSu = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const canViewRanking = useHasPerm(PERM.PERM_VIEW_RANKING);
  const visibleNavItems = canViewRanking ? NAV_ITEMS : NAV_ITEMS.filter((item) => item.to !== 'ranking');

  useEffect(() => {
    const activeTab = activeNav ? tabRefs.current.get(activeNav) : undefined;
    const container = containerRef.current;
    if (activeTab && container) {
      const cr = container.getBoundingClientRect();
      const tr = activeTab.getBoundingClientRect();
      setIndicator({ left: tr.left - cr.left, width: tr.width });
    } else {
      setIndicator((current) => ({ left: current.left, width: 0 }));
    }
  }, [activeNav]);

  return (
    <>
      <div className="hydro-top-nav">
        <div className="hydro-container flex h-16 items-center justify-between">
          <Group gap="lg" wrap="nowrap">
            <Link to="homepage" className="group flex min-w-0 items-center gap-3 no-underline">
              <img src={logoUrl} alt="" className="h-11 w-11 shrink-0 object-contain" />
              <span className="hidden min-w-0 sm:block">
                <span className="block truncate text-base font-black leading-tight text-[var(--hydro-text)]">
                  {serverName || 'HydroNext'}
                </span>
                <span className="block text-[11px] font-semibold uppercase text-[var(--hydro-text-muted)]">
                  {t('Online Judge')}
                </span>
              </span>
            </Link>
            <div ref={containerRef} className="relative hidden lg:flex">
              {visibleNavItems.map((item) => (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  ref={(el) => { if (el) tabRefs.current.set(item.to, el); }}
                  variant="subtle"
                  color={activeNav === item.to ? 'hydroTeal' : 'gray'}
                  className={
                    activeNav === item.to
                      ? 'text-[var(--hydro-primary)] transition-colors duration-150'
                      : 'text-[var(--hydro-text)] transition-colors duration-150 hover:bg-[var(--hydro-surface-muted)]'
                  }
                >
                  {t(item.label)}
                </Button>
              ))}
              <div
                className="hydro-top-nav__indicator"
                style={{ left: indicator.left, width: indicator.width }}
              />
            </div>
          </Group>

          <Group gap="sm" wrap="nowrap">
            <AccentColorPicker />
            <ThemeToggle />
            {isLoggedIn && <DomainSwitcher />}
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

      <Drawer
        opened={opened}
        onClose={close}
        title={serverName || 'HydroNext'}
        size="xs"
        classNames={{
          header: 'hydro-nav-drawer__header',
          body: 'hydro-nav-drawer__body',
        }}
      >
        <Stack gap="xs">
          {visibleNavItems.map((item) => (
            <Button
              key={item.to}
              component={Link}
              to={item.to}
              variant={activeNav === item.to ? 'filled' : 'subtle'}
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
                <Button
                  component={Link}
                  to="user_detail"
                  params={{ uid: useSessionStore.getState().user._id }}
                  variant="subtle"
                  fullWidth
                  justify="flex-start"
                  onClick={close}
                >
                  {t('My Profile')}
                </Button>
                <Button
                  component={Link}
                  to="home_settings"
                  params={{ category: 'preference' }}
                  variant="subtle"
                  fullWidth
                  justify="flex-start"
                  onClick={close}>
                  {t('Settings')}
                </Button>
                <Button component={Link} to="home_domain" variant="subtle" fullWidth justify="flex-start" onClick={close}>
                  {t('My Domains')}
                </Button>
                {isSu && (
                  <Button component={Link} to="manage_honor_frames" variant="subtle" fullWidth justify="flex-start" onClick={close}>
                    {t('Avatar frame management')}
                  </Button>
                )}
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
                <Button
                  component={Link}
                  to="user_login"
                  variant={registrationEnabled ? 'subtle' : 'filled'}
                  fullWidth
                  justify="flex-start"
                  onClick={close}
                >
                  {t('Login')}
                </Button>
                {registrationEnabled && (
                  <Button component={Link} to="user_register" variant="filled" fullWidth justify="flex-start" onClick={close}>
                    {t('Register')}
                  </Button>
                )}
              </>
            )}
          </div>
        </Stack>
      </Drawer>
    </>
  );
}
