import { Avatar, Group, Loader, Menu, ScrollArea, Text } from '@mantine/core';
import { IconChevronDown } from '@tabler/icons-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

interface DomainItem {
  _id: string;
  name: string;
}

function getDomainInitial(name?: string, fallback = 'D') {
  return (name?.trim() || fallback).charAt(0).toLocaleUpperCase();
}

function AuthenticatedDomainSwitcher({ uid }: { uid: number }) {
  const domainId = useSessionStore((s) => s.ui.domainId);
  const domain = useSessionStore((s) => s.ui.domain);
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const [domains, setDomains] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [opened, setOpened] = useState(false);
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
    if (nextOpened) void fetchDomains();
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

  return (
    <Menu
      shadow="md"
      width={240}
      opened={opened}
      onChange={handleOpenedChange}
      position="bottom-end"
      classNames={{ dropdown: 'hydro-topbar-dropdown' }}
    >
      <Menu.Target>
        <Button
          variant="subtle"
          size="xs"
          px="xs"
          leftSection={(
            <Avatar color="hydroTeal" size={22} radius="xl" variant="light">
              {displayInitial}
            </Avatar>
          )}
          rightSection={<IconChevronDown size={12} />}
        >
          <Text size="xs" truncate maw={100}>{displayName}</Text>
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Label>{t('Switch Domain')}</Menu.Label>
        {loading ? (
          <Group justify="center" p="md">
            <Loader size="sm" />
          </Group>
        ) : (
          <ScrollArea.Autosize mah={300}>
            <Menu.Item
              onClick={() => switchDomain('system')}
              fw={domainId === 'system' ? 700 : 400}
              bg={domainId === 'system' ? 'var(--hydro-surface-muted)' : undefined}
            >
              <Group gap="sm">
                <Avatar color="hydroTeal" size="sm" radius="xl" variant="light">
                  {getDomainInitial('System')}
                </Avatar>
                <Text size="sm">{domainId === 'system' ? displayName : 'System'}</Text>
              </Group>
            </Menu.Item>
            {domains.filter((d) => d._id !== 'system').map((d) => (
              <Menu.Item
                key={d._id}
                onClick={() => switchDomain(d._id)}
                fw={domainId === d._id ? 700 : 400}
                bg={domainId === d._id ? 'var(--hydro-surface-muted)' : undefined}
              >
                <Group gap="sm">
                  <Avatar color="hydroTeal" size="sm" radius="xl" variant="light">
                    {getDomainInitial(d.name, d._id)}
                  </Avatar>
                  <div className="min-w-0">
                    <Text size="sm" truncate>{d.name}</Text>
                    <Text size="xs" c="dimmed">{d._id}</Text>
                  </div>
                </Group>
              </Menu.Item>
            ))}
          </ScrollArea.Autosize>
        )}
      </Menu.Dropdown>
    </Menu>
  );
}

export function DomainSwitcher() {
  const uid = useSessionStore((s) => s.user._id);
  // A keyed session boundary also prevents one account's cached domains reaching another account.
  return uid > 0 ? <AuthenticatedDomainSwitcher key={uid} uid={uid} /> : null;
}
