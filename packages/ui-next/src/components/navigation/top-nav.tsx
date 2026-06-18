import { Avatar, Burger, Button, Drawer, Group, Menu, Stack, Text, UnstyledButton } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Link } from '@/components/link';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser, useIsLoggedIn } from '@/hooks/use-current-user';
import { useDomain } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { LanguageMenu } from './language-menu';

function UserMenu() {
  const user = useCurrentUser();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const domainId = useSessionStore((s) => s.ui.domainId);

  return (
    <Menu shadow="md" width={200}>
      <Menu.Target>
        <UnstyledButton className="flex items-center gap-2">
          <Avatar src={user.avatar} size={28} radius="xl" />
          <Text size="sm" fw={500}>
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
      <Button component={Link} to="user_login" variant="subtle" size="xs">
        {t('Login')}
      </Button>
      <Button component={Link} to="user_register" size="xs">
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
  { to: 'discussion_main', label: 'Discussion' },
] as const;

export function TopNav() {
  const [opened, { toggle, close }] = useDisclosure(false);
  const isLoggedIn = useIsLoggedIn();
  const domain = useDomain();
  const { t } = useI18n();

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--hydro-border)] bg-[var(--hydro-bg)]">
        <div className="mx-auto flex h-12 max-w-7xl items-center justify-between px-4">
          <Group gap="lg">
            <Link to="homepage" className="text-lg font-bold text-[var(--hydro-text)] no-underline">
              {domain.name || 'Hydro'}
            </Link>
            <Group gap="xs" className="hidden md:flex">
              {NAV_ITEMS.map((item) => (
                <Button
                  key={item.to}
                  component={Link}
                  to={item.to}
                  variant="subtle"
                  size="xs"
                  className="text-[var(--hydro-text)]"
                >
                  {t(item.label)}
                </Button>
              ))}
            </Group>
          </Group>

          <Group gap="sm">
            <LanguageMenu />
            <div className="hidden md:block">
              {isLoggedIn ? <UserMenu /> : <GuestMenu />}
            </div>
            <Burger
              opened={opened}
              onClick={toggle}
              className="md:hidden"
              size="sm"
            />
          </Group>
        </div>
      </header>

      <Drawer opened={opened} onClose={close} title={domain.name || 'Hydro'} size="xs">
        <Stack gap="xs">
          {NAV_ITEMS.map((item) => (
            <Button
              key={item.to}
              component={Link}
              to={item.to}
              variant="subtle"
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
