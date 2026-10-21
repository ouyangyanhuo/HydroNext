import {
  ActionIcon,
  Avatar,
  Badge,
  Card,
  Divider,
  Group,
  SimpleGrid,
  Stack,
  Text,
  Title,
  Tooltip,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconAlertTriangle,
  IconArrowUpRight,
  IconCheck,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconEye,
  IconFolder,
  IconLock,
  IconRefresh,
  IconSettings,
  IconShield,
  IconSpeakerphone,
  IconTools,
  IconUserPlus,
  IconUsers,
} from '@tabler/icons-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useDomain } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, usePermission } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';
import { getAvatarUrl } from '@/utils/avatar';
import { formatErrorMessage } from '@/utils/error';

function DomainBulletin({ bulletin }: { bulletin: string }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState(false);
  const [isOverflowing, setIsOverflowing] = useState(false);
  const [fullHeight, setFullHeight] = useState<number>(196);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = innerRef.current;
    if (!element) return () => {};
    const update = () => {
      const height = element.scrollHeight;
      setFullHeight(height);
      setIsOverflowing(height > 142);
    };
    update();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(update)
      : null;
    observer?.observe(element);
    return () => {
      observer?.disconnect();
    };
  }, [bulletin]);

  if (!bulletin) return null;

  return (
    <section className="hydro-bulletin" aria-labelledby="hydro-domain-bulletin-title">
      <div className="hydro-bulletin__header">
        <div className="hydro-bulletin__title-wrap" id="hydro-domain-bulletin-title">
          <span className="hydro-bulletin__icon" aria-hidden="true">
            <IconSpeakerphone size={16} stroke={2} />
          </span>
          <span className="hydro-bulletin__title">{t('Bulletin')}</span>
        </div>
        {isOverflowing && (
          <Button
            variant="subtle"
            size="sm"
            className="hydro-bulletin__toggle"
            onClick={() => setExpanded(!expanded)}
            rightSection={(
              <IconChevronDown
                size={16}
                stroke={2}
                className={`hydro-bulletin__toggle-icon ${expanded ? 'hydro-bulletin__toggle-icon--expanded' : ''}`}
                aria-hidden="true"
              />
            )}
          >
            {expanded ? t('Show less') : t('Show more')}
          </Button>
        )}
      </div>
      <div className="hydro-bulletin__body">
        <div
          className={`hydro-bulletin__content ${
            isOverflowing ? (expanded ? 'hydro-bulletin__content--expanded' : 'hydro-bulletin__content--clamped') : ''
          }`}
          style={isOverflowing ? { maxHeight: expanded ? `${fullHeight}px` : '196px' } : undefined}
        >
          <div ref={innerRef} className="hydro-bulletin__inner typo">
            <MarkdownRenderer content={bulletin} />
          </div>
        </div>
      </div>
    </section>
  );
}

export default function DomainDashboardPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const domain = useDomain();
  const user = useSessionStore((s) => s.user);
  const { hasPriv } = usePermission();

  const ddoc = args.domain || args.ddoc || domain || {};
  const owner = args.owner;
  const domainId = ddoc._id || 'system';

  const [deleteOpened, setDeleteOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [initNodesOpened, setInitNodesOpened] = useState(false);
  const [inittingNodes, setInittingNodes] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [error, setError] = useState('');

  const canDeleteDomain = (owner?._id === user._id || hasPriv(PRIV.PRIV_DELETE_DOMAIN)) && domainId !== 'system';

  const handleCopyId = async () => {
    if (!ddoc._id) return;
    try {
      await navigator.clipboard.writeText(ddoc._id);
      setCopiedId(true);
      setTimeout(() => setCopiedId(false), 2000);
    } catch {
      // Ignore clipboard error
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'delete' }),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else window.location.href = buildUrl('home_domain');
    } catch {
      setError(t('Network error'));
    } finally {
      setDeleting(false);
      setDeleteOpened(false);
    }
  };

  const handleInitDiscussion = async () => {
    setInittingNodes(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ operation: 'init_discussion_node' }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Failed')), message: '', color: 'red' });
      } else {
        notifications.show({ title: t('Discussion nodes initialized'), message: '', color: 'green' });
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setInittingNodes(false);
      setInitNodesOpened(false);
    }
  };

  const configEntries = [
    {
      to: 'domain_edit',
      title: t('Domain Settings'),
      desc: t('Configure basic domain properties, bulletin, and general preferences.'),
      icon: <IconSettings size={22} />,
      badge: t('Configuration'),
    },
    {
      to: 'domain_visibility',
      title: t('Visibility and contests'),
      desc: t('Manage navigation bar visibility, contest mode, and homepage display.'),
      icon: <IconEye size={22} />,
      badge: t('Configuration'),
    },
    {
      to: 'domain_join_applications',
      title: t('Join Settings'),
      desc: t('Audit join applications, manage invitation codes and admission rules.'),
      icon: <IconUserPlus size={22} />,
      badge: t('Users'),
    },
  ];

  const accessEntries = [
    {
      to: 'domain_user',
      title: t('User Management'),
      desc: t('View domain members, assign roles, and manage memberships.'),
      icon: <IconUsers size={22} />,
      badge: t('Users'),
    },
    {
      to: 'domain_role',
      title: t('Role Management'),
      desc: t('Customize domain roles, define role priorities and assignable roles.'),
      icon: <IconShield size={22} />,
      badge: t('Roles'),
    },
    {
      to: 'domain_permission',
      title: t('Permissions'),
      desc: t('Configure role-level and system privileges within the domain.'),
      icon: <IconLock size={22} />,
      badge: t('Security'),
    },
    {
      to: 'domain_group',
      title: t('Groups'),
      desc: t('Organize users into groups for batch operations and team access.'),
      icon: <IconFolder size={22} />,
      badge: t('Groups'),
    },
  ];

  return (
    <Stack gap="lg" className="hydro-domain-dashboard">
      <PageHeader title={`${t('Domain Manage')} - ${ddoc.name || domainId}`}>
        <Group gap="xs">
          <Button
            component={Link}
            to="homepage"
            params={{ domainId }}
            size="xs"
            variant="default"
            leftSection={<IconArrowUpRight size={14} />}
          >
            {t('Visit')}
          </Button>
        </Group>
      </PageHeader>

      {error && <Text c="red" size="sm">{error}</Text>}

      {/* Hero Overview Card */}
      <Card withBorder p="xl" className="hydro-content-card hydro-domain-hero">
        <Stack gap="lg">
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Group gap="md" align="center">
              <Avatar
                src={getAvatarUrl(ddoc.avatar)}
                size={64}
                radius="lg"
                className="hydro-domain-hero__avatar"
              />
              <Stack gap={4}>
                <Group gap="xs" align="center" wrap="wrap">
                  <Title order={2} size="h3" fw="var(--hydro-weight-semibold)">
                    {ddoc.name || domainId}
                  </Title>
                  {domainId === 'system' && (
                    <Badge color="blue" variant="light" size="sm">
                      {t('System Domain')}
                    </Badge>
                  )}
                  {ddoc.contestMode && (
                    <Badge color="orange" variant="light" size="sm">
                      {t('Contest Mode Active')}
                    </Badge>
                  )}
                </Group>
                <Group gap={6} align="center">
                  <Text size="xs" c="dimmed" className="hydro-domain-hero__id">
                    ID: {domainId}
                  </Text>
                  <Tooltip label={copiedId ? t('Copied') : t('Copy')} withArrow>
                    <ActionIcon
                      size="xs"
                      variant="subtle"
                      color={copiedId ? 'teal' : 'gray'}
                      onClick={handleCopyId}
                      aria-label="Copy domain id"
                    >
                      {copiedId ? <IconCheck size={12} /> : <IconCopy size={12} />}
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Stack>
            </Group>
          </Group>

          <Divider />

          <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="md">
            <div className="hydro-domain-stat">
              <Text size="xs" c="dimmed">{t('Owner')}</Text>
              <div className="mt-1">
                {owner ? <UserLink user={owner} size="sm" /> : <Text size="sm" c="dimmed">-</Text>}
              </div>
            </div>
            <div className="hydro-domain-stat">
              <Text size="xs" c="dimmed">{t('Roles')}</Text>
              <Text size="sm" fw="var(--hydro-weight-medium)" className="mt-1">
                {Object.keys(ddoc.roles || {}).length}
              </Text>
            </div>
            <div className="hydro-domain-stat">
              <Text size="xs" c="dimmed">{t('Contest Mode')}</Text>
              <Text size="sm" fw="var(--hydro-weight-medium)" className="mt-1">
                {ddoc.contestMode ? t('Enabled') : t('Disabled')}
              </Text>
            </div>
            <div className="hydro-domain-stat">
              <Text size="xs" c="dimmed">{t('Frontpage URL')}</Text>
              <Text size="sm" ff="monospace" c="dimmed" className="mt-1 truncate">
                {`/d/${domainId}`}
              </Text>
            </div>
          </SimpleGrid>
        </Stack>
      </Card>

      {/* Bulletin */}
      {ddoc.bulletin && <DomainBulletin bulletin={ddoc.bulletin} />}

      {/* Configuration & Display */}
      <Stack gap="sm">
        <Text size="xs" fw="var(--hydro-weight-bold)" c="dimmed" tt="uppercase" className="tracking-wider px-1">
          {t('Properties')}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 3 }} spacing="md">
          {configEntries.map((item) => (
            <Card
              key={item.to}
              withBorder
              p="md"
              className="hydro-card hydro-domain-panel-card"
            >
              <Stack gap="sm" className="h-full">
                <Group justify="space-between" align="flex-start">
                  <span className="hydro-domain-panel-card__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <Badge size="xs" variant="light">
                    {item.badge}
                  </Badge>
                </Group>
                <div>
                  <Text fw="var(--hydro-weight-semibold)" size="sm">
                    {item.title}
                  </Text>
                  <Text size="xs" c="dimmed" className="mt-1 min-h-[36px] line-clamp-2">
                    {item.desc}
                  </Text>
                </div>
                <Group justify="flex-end" mt="auto" pt="xs">
                  <Button
                    component={Link}
                    to={item.to}
                    params={{ domainId }}
                    size="xs"
                    variant="light"
                    rightSection={<IconChevronRight size={14} />}
                  >
                    {t('Open Panel')}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>

      {/* Access Control & Members */}
      <Stack gap="sm">
        <Text size="xs" fw="var(--hydro-weight-bold)" c="dimmed" tt="uppercase" className="tracking-wider px-1">
          {t('Access Control')}
        </Text>
        <SimpleGrid cols={{ base: 1, sm: 2, lg: 4 }} spacing="md">
          {accessEntries.map((item) => (
            <Card
              key={item.to}
              withBorder
              p="md"
              className="hydro-card hydro-domain-panel-card"
            >
              <Stack gap="sm" className="h-full">
                <Group justify="space-between" align="flex-start">
                  <span className="hydro-domain-panel-card__icon" aria-hidden="true">
                    {item.icon}
                  </span>
                  <Badge size="xs" variant="light">
                    {item.badge}
                  </Badge>
                </Group>
                <div>
                  <Text fw="var(--hydro-weight-semibold)" size="sm">
                    {item.title}
                  </Text>
                  <Text size="xs" c="dimmed" className="mt-1 min-h-[36px] line-clamp-2">
                    {item.desc}
                  </Text>
                </div>
                <Group justify="flex-end" mt="auto" pt="xs">
                  <Button
                    component={Link}
                    to={item.to}
                    params={{ domainId }}
                    size="xs"
                    variant="light"
                    rightSection={<IconChevronRight size={14} />}
                  >
                    {t('Open Panel')}
                  </Button>
                </Group>
              </Stack>
            </Card>
          ))}
        </SimpleGrid>
      </Stack>

      {/* Domain Maintenance & Tools */}
      <Stack gap="sm">
        <Text size="xs" fw="var(--hydro-weight-bold)" c="dimmed" tt="uppercase" className="tracking-wider px-1">
          {t('Tools')}
        </Text>
        <Card withBorder p="lg" className="hydro-content-card">
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Group gap="md">
              <span className="hydro-domain-panel-card__icon hydro-domain-panel-card__icon--tools" aria-hidden="true">
                <IconTools size={22} />
              </span>
              <div>
                <Text fw="var(--hydro-weight-semibold)" size="sm">
                  {t('Init Discussion Nodes')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('Reset and synchronize default discussion forums and category nodes for this domain.')}
                </Text>
              </div>
            </Group>
            <Button
              variant="default"
              size="xs"
              leftSection={<IconRefresh size={14} />}
              loading={inittingNodes}
              onClick={() => setInitNodesOpened(true)}
            >
              {t('Init Discussion Nodes')}
            </Button>
          </Group>
        </Card>
      </Stack>

      {/* Danger Zone */}
      {canDeleteDomain && (
        <Card withBorder p="lg" className="hydro-content-card hydro-domain-danger-card">
          <Group justify="space-between" align="center" wrap="wrap" gap="md">
            <Group gap="md">
              <span className="hydro-domain-danger-card__icon" aria-hidden="true">
                <IconAlertTriangle size={22} />
              </span>
              <div>
                <Text fw="var(--hydro-weight-semibold)" c="red" size="sm">
                  {t('Delete Domain')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('This operation cannot be undone.')}
                </Text>
              </div>
            </Group>
            <Button color="red" variant="light" size="xs" onClick={() => setDeleteOpened(true)}>
              {t('Delete Domain')}
            </Button>
          </Group>
        </Card>
      )}

      {/* Confirm dialogs */}
      <ConfirmDialog
        opened={deleteOpened}
        onClose={() => setDeleteOpened(false)}
        onConfirm={handleDelete}
        title={t('Delete Domain')}
        message={t('Confirm to delete this domain?')}
        confirmLabel={t('Delete')}
        cancelLabel={t('Cancel')}
        loading={deleting}
      />

      <ConfirmDialog
        opened={initNodesOpened}
        onClose={() => setInitNodesOpened(false)}
        onConfirm={handleInitDiscussion}
        title={t('Init Discussion Nodes')}
        message={t('Confirm to reset discussion nodes? Default discussion categories will be restored.')}
        confirmLabel={t('Confirm')}
        confirmColor="blue"
        cancelLabel={t('Cancel')}
        loading={inittingNodes}
      />
    </Stack>
  );
}
