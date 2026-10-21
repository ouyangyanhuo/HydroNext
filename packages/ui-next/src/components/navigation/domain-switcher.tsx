import { Avatar, Badge, Group, Loader, Menu, ScrollArea, Text, TextInput } from '@mantine/core';
import { IconBuildingCommunity, IconCheck, IconChevronDown, IconSearch, IconX } from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { Link } from '@/components/link';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

interface DomainItem {
  _id: string;
  name: string;
  avatar?: string;
}

function getDomainInitial(name?: string, fallback = 'D') {
  return (name?.trim() || fallback).charAt(0).toLocaleUpperCase();
}

function getDomainAvatarUrl(avatar?: string) {
  if (!avatar) return undefined;
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/')) return avatar;
  if (avatar.startsWith('url:')) return avatar.slice(4);
  return undefined;
}

function AuthenticatedDomainSwitcher({ uid }: { uid: number }) {
  const domainId = useSessionStore((s) => s.ui.domainId);
  const domain = useSessionStore((s) => s.ui.domain);
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);
  const [search, setSearch] = useState('');
  const requestRef = useRef<AbortController | null>(null);

  useEffect(() => () => requestRef.current?.abort(), []);

  const fetchDomains = useCallback(async () => {
    if (useSessionStore.getState().user._id !== uid || domains.length > 0 || requestRef.current) return;
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(buildUrl('home_domain'), {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (res.ok && !controller.signal.aborted) {
        const data = await res.json();
        if (!controller.signal.aborted && useSessionStore.getState().user._id === uid) {
          setDomains(Array.isArray(data.ddocs) ? data.ddocs : []);
        }
      }
    } catch {
      // silent fail
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        if (!controller.signal.aborted) setLoading(false);
      }
    }
  }, [buildUrl, domains.length, uid]);

  const handleOpenedChange = (nextOpened: boolean) => {
    if (useSessionStore.getState().user._id !== uid) return;
    setOpened(nextOpened);
    if (nextOpened) {
      void fetchDomains();
    } else {
      setSearch('');
    }
  };

  const switchDomain = (targetDomainId: string) => {
    if (useSessionStore.getState().user._id !== uid) return;
    const currentPath = window.location.pathname;
    let newPath: string;

    if (currentPath.startsWith('/d/')) {
      const parts = currentPath.split('/');
      // /d/domainId/rest... -> replace domainId
      if (targetDomainId === 'system') {
        newPath = `/${parts.slice(3).join('/')}`;
      } else {
        parts[2] = targetDomainId;
        newPath = parts.join('/');
      }
    } else {
      if (targetDomainId === 'system') {
        newPath = currentPath;
      } else {
        newPath = `/d/${targetDomainId}${currentPath}`;
      }
    }

    window.location.href = newPath + window.location.search;
  };

  const displayName = domainId === 'system' ? (domain?.name || 'System') : (domain?.name || domainId);
  const displayInitial = getDomainInitial(displayName, domainId);

  const q = search.trim().toLowerCase();
  const systemMatches = !q || 'system'.includes(q) || '系统'.includes(q) || (displayName || '').toLowerCase().includes(q);
  const filteredDomains = useMemo(() => {
    const list = domains.filter((d) => d._id !== 'system');
    if (!q) return list;
    return list.filter((d) => (d.name || '').toLowerCase().includes(q) || d._id.toLowerCase().includes(q));
  }, [domains, q]);

  const hasNoResults = !systemMatches && filteredDomains.length === 0;

  return (
    <Menu
      shadow="md"
      width={260}
      opened={opened}
      onChange={handleOpenedChange}
      position="bottom-end"
      classNames={{ dropdown: 'hydro-topbar-dropdown' }}
    >
      <Menu.Target>
        <Button
          variant="subtle"
          size="xs"
          className="hydro-domain-switcher-trigger"
          data-expanded={opened || undefined}
          leftSection={(
            <Avatar
              src={getDomainAvatarUrl(domain?.avatar)}
              color="hydroTeal"
              size={20}
              radius="xl"
              variant="light"
              className="hydro-domain-switcher-trigger__avatar"
            >
              {displayInitial}
            </Avatar>
          )}
          rightSection={(
            <IconChevronDown
              size={14}
              stroke={2}
              className="hydro-domain-switcher-trigger__chevron"
            />
          )}
        >
          <Text size="xs" truncate maw={{ base: 84, sm: 130 }}>{displayName}</Text>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <div className="px-2 pt-1 pb-1.5 flex items-center justify-between">
          <Text size="xs" fw="var(--hydro-weight-semibold)" c="dimmed" tt="uppercase" className="tracking-wider">
            {t('Switch Domain')}
          </Text>
          <Badge size="xs" variant="light" color="gray">
            {domains.length > 0 ? domains.length : 1}
          </Badge>
        </div>

        {domains.length > 2 && (
          <div
            className="px-1.5 pb-2"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
          >
            <TextInput
              size="xs"
              placeholder={t('Search')}
              leftSection={<IconSearch size={14} className="text-[var(--hydro-text-muted)]" />}
              value={search}
              onChange={(e) => setSearch(e.currentTarget.value)}
              rightSection={
                search ? (
                  <ActionIcon size="xs" variant="subtle" color="gray" onClick={() => setSearch('')}>
                    <IconX size={12} />
                  </ActionIcon>
                ) : null
              }
            />
          </div>
        )}

        {loading ? (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        ) : (
          <ScrollArea.Autosize mah={280}>
            <div className="hydro-domain-menu-list flex flex-col gap-1 p-0.5">
              {systemMatches && (
                <Menu.Item
                  onClick={() => switchDomain('system')}
                  className={`hydro-domain-menu-item ${domainId === 'system' ? 'hydro-domain-menu-item--active' : ''}`}
                  rightSection={
                    domainId === 'system' ? (
                      <IconCheck size={16} stroke={2.5} className="text-[var(--hydro-primary-strong)]" />
                    ) : null
                  }
                >
                  <Group gap="sm" wrap="nowrap">
                    <Avatar color="hydroTeal" size={28} radius="xl" variant="light" className="hydro-domain-menu-item__avatar">
                      {getDomainInitial('System')}
                    </Avatar>
                    <div className="min-w-0 flex-1">
                      <Text size="sm" fw={domainId === 'system' ? 'var(--hydro-weight-semibold)' : 'var(--hydro-weight-normal)'} truncate>
                        {domainId === 'system' ? displayName : 'System'}
                      </Text>
                      <Text size="xs" c="dimmed" ff="monospace">system</Text>
                    </div>
                  </Group>
                </Menu.Item>
              )}

              {filteredDomains.map((d) => {
                const isSelected = domainId === d._id;
                return (
                  <Menu.Item
                    key={d._id}
                    onClick={() => switchDomain(d._id)}
                    className={`hydro-domain-menu-item ${isSelected ? 'hydro-domain-menu-item--active' : ''}`}
                    rightSection={
                      isSelected ? (
                        <IconCheck size={16} stroke={2.5} className="text-[var(--hydro-primary-strong)]" />
                      ) : null
                    }
                  >
                    <Group gap="sm" wrap="nowrap">
                      <Avatar
                        src={getDomainAvatarUrl(d.avatar)}
                        color="hydroTeal"
                        size={28}
                        radius="xl"
                        variant="light"
                        className="hydro-domain-menu-item__avatar"
                      >
                        {getDomainInitial(d.name, d._id)}
                      </Avatar>
                      <div className="min-w-0 flex-1">
                        <Text size="sm" fw={isSelected ? 'var(--hydro-weight-semibold)' : 'var(--hydro-weight-normal)'} truncate>
                          {d.name}
                        </Text>
                        <Text size="xs" c="dimmed" ff="monospace">{d._id}</Text>
                      </div>
                    </Group>
                  </Menu.Item>
                );
              })}

              {hasNoResults && (
                <Text size="xs" c="dimmed" ta="center" py="md">
                  {t('No results')}
                </Text>
              )}
            </div>
          </ScrollArea.Autosize>
        )}

        <div className="my-1 border-t border-[var(--hydro-border)]" />
        <Menu.Item
          component={Link}
          to="home_domain"
          leftSection={<IconBuildingCommunity size={16} className="text-[var(--hydro-text-muted)]" />}
        >
          <Text size="xs" fw="var(--hydro-weight-medium)">
            {t('All Domains')}
          </Text>
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
}

export function DomainSwitcher() {
  const uid = useSessionStore((s) => s.user._id);
  // A keyed session boundary also prevents one account's cached domains reaching another account.
  return uid > 0 ? <AuthenticatedDomainSwitcher key={uid} uid={uid} /> : null;
}
