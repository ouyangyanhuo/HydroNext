import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Checkbox, Group, Modal, ScrollArea, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

function toBigIntValue(value: any) {
  try {
    if (value == null || value === '') return BigInt(0);
    const s = String(value);
    if (s.startsWith('BigInt::')) return BigInt(s.slice(8));
    return BigInt(s);
  } catch {
    return BigInt(0);
  }
}

function diffPriv(priv: any, defaultPriv: any, privMap: Record<string, any>) {
  const current = toBigIntValue(priv);
  const base = toBigIntValue(defaultPriv);
  const plus: string[] = [];
  const minus: string[] = [];
  for (const [name, raw] of Object.entries(privMap || {})) {
    const bit = toBigIntValue(raw);
    if (!bit) continue;
    const has = (current & bit) === bit;
    const baseHas = (base & bit) === bit;
    if (has && !baseHas) plus.push(name);
    if (!has && baseHas) minus.push(name);
  }
  return { plus, minus };
}

function PrivSummary({ priv, defaultPriv, privMap }: { priv: any, defaultPriv: any, privMap: Record<string, any> }) {
  const { t } = useI18n();
  if (Number(priv) === 0) return <Badge color="red" variant="light">PRIV_NONE</Badge>;
  if (Number(priv) === -1) return <Badge color="green" variant="light">PRIV_ALL</Badge>;
  const diff = diffPriv(priv, defaultPriv, privMap);
  if (!diff.plus.length && !diff.minus.length) return <Text size="xs" c="dimmed">{t('Same as default')}</Text>;
  return (
    <Stack gap={3}>
      {diff.plus.slice(0, 6).map((name) => <Text key={name} size="xs" c="green">+{name}</Text>)}
      {diff.minus.slice(0, 6).map((name) => <Text key={name} size="xs" c="red">-{name}</Text>)}
      {diff.plus.length + diff.minus.length > 12 && <Text size="xs" c="dimmed">...</Text>}
    </Stack>
  );
}

function hasBit(value: any, bit: any) {
  const current = toBigIntValue(value);
  const mask = toBigIntValue(bit);
  if (!mask) return false;
  return (current & mask) === mask;
}

function splitColumns<T>(items: T[], count: number) {
  const size = Math.ceil(items.length / count);
  return Array.from({ length: count }, (_, index) => items.slice(index * size, (index + 1) * size));
}

export default function ManageUserPrivPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const udocs = args.udocs || [];
  const defaultPriv = args.defaultPriv ?? 0;
  const privMap = args.Priv || {};
  const privEntries = Object.entries(privMap || {}).filter(([, value]) => toBigIntValue(value) > 0n);
  const [dialog, setDialog] = useState<{ uid: number, priv: any, system: boolean, title: string } | null>(null);
  const [selectedPrivs, setSelectedPrivs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const openDialog = (next: { uid: number, priv: any, system: boolean, title: string }) => {
    setDialog(next);
    setSelectedPrivs(new Set(
      privEntries
        .filter(([, value]) => hasBit(next.priv, value))
        .map(([name]) => name),
    ));
  };

  const togglePriv = (name: string, checked: boolean) => {
    setSelectedPrivs((prev) => {
      const next = new Set(prev);
      if (checked) next.add(name);
      else next.delete(name);
      return next;
    });
  };

  const computedPriv = () => {
    let value = 0n;
    for (const [name, bit] of privEntries) {
      if (selectedPrivs.has(name)) value |= toBigIntValue(bit);
    }
    return value;
  };

  const submitPriv = async () => {
    if (!dialog) return;
    setLoading(true);
    setError('');
    setSuccess('');
    const nextPriv = computedPriv();
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          uid: dialog.uid,
          priv: Number(nextPriv),
          system: dialog.system,
        }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else {
        setSuccess(t('Saved'));
        setDialog(null);
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    {
      key: 'uid',
      title: t('User ID'),
      width: 90,
      render: (user: any) => <Text size="sm" fw={700}>{user._id}</Text>,
    },
    {
      key: 'user',
      title: t('User'),
      render: (user: any) => <UserLink user={user} size="sm" />,
    },
    {
      key: 'privInfo',
      title: t('Privilege'),
      render: (user: any) => <PrivSummary priv={user.priv} defaultPriv={defaultPriv} privMap={privMap} />,
    },
    {
      key: 'priv',
      title: t('Value'),
      width: 130,
      align: 'right' as const,
      render: (user: any) => <Text size="xs" ff="monospace">{user.priv}</Text>,
    },
    {
      key: 'action',
      title: t('Actions'),
      width: 100,
      align: 'right' as const,
      render: (user: any) => (
        <Button
          size="compact-xs"
          variant="subtle"
          onClick={() => openDialog({ uid: user._id, priv: user.priv, system: false, title: `${t('Set Privilege')} #${user._id}` })}
        >
          {t('Edit')}
        </Button>
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('User Privileges')} />
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}

      <SimpleGrid cols={{ base: 1, lg: 3 }} spacing="md">
        <Card withBorder p="lg" className="hydro-content-card lg:col-span-1">
          <Title order={3} size="h4" mb="sm">{t('Default Privilege')}</Title>
          <Text size="xl" fw={800} ff="monospace">{defaultPriv}</Text>
          <Stack gap={4} mt="md">
            {Object.entries(privMap).filter(([, value]) => {
              const bit = toBigIntValue(value);
              return bit && (toBigIntValue(defaultPriv) & bit) === bit;
            }).slice(0, 10).map(([name]) => <Text key={name} size="xs" c="dimmed">{name}</Text>)}
          </Stack>
          <Button
            mt="md"
            size="xs"
            variant="light"
            onClick={() => openDialog({ uid: 0, priv: defaultPriv, system: true, title: t('Default Privilege') })}
          >
            {t('Edit')}
          </Button>
        </Card>

        <Card withBorder p="lg" className="hydro-content-card lg:col-span-2">
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">{t('Special Users')}</Title>
            <Badge variant="light">{udocs.length}</Badge>
          </Group>
          <DataTable
            columns={columns}
            data={udocs.map((user: any) => ({ ...user, _id: user._id }))}
            emptyMessage={t('No users')}
          />
        </Card>
      </SimpleGrid>

      <Modal
        opened={!!dialog}
        title={dialog?.title || t('Set Privilege')}
        onClose={() => setDialog(null)}
        size="xl"
      >
        <Stack gap="md">
          <Group justify="space-between">
            <Stack gap={2}>
              <Text size="sm" c="dimmed">{t('Value')}</Text>
              <Text ff="monospace" fw={700}>{computedPriv().toString()}</Text>
            </Stack>
            <Group gap="xs">
              <Button size="xs" variant="light" onClick={() => setSelectedPrivs(new Set(privEntries.map(([name]) => name)))}>
                {t('Select All')}
              </Button>
              <Button size="xs" variant="light" onClick={() => setSelectedPrivs(new Set())}>
                {t('Clear')}
              </Button>
            </Group>
          </Group>
          <ScrollArea h={460}>
            <SimpleGrid cols={{ base: 1, md: 3 }} spacing="md">
              {splitColumns(privEntries, 3).map((items, index) => (
                <Stack key={index} gap="xs">
                  {items.map(([name]) => (
                    <Checkbox
                      key={name}
                      label={t(name)}
                      checked={selectedPrivs.has(name)}
                      onChange={(e) => togglePriv(name, e.currentTarget.checked)}
                    />
                  ))}
                </Stack>
              ))}
            </SimpleGrid>
          </ScrollArea>
          {error && <Text size="xs" c="red">{error}</Text>}
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setDialog(null)}>{t('Cancel')}</Button>
            <Button size="xs" onClick={submitPriv} loading={loading}>{t('Save')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
