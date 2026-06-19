import { Badge, Button, Checkbox, Group, Paper, ScrollArea, Stack, Table, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function normalizeRoles(input: any) {
  if (Array.isArray(input)) return input;
  if (input instanceof Map) return Array.from(input.entries()).map(([id, role]: [string, any]) => ({
    _id: id,
    ...(typeof role === 'object' && role ? role : { perm: role }),
  }));
  return Object.entries(input || {}).map(([id, role]: [string, any]) => ({
    _id: id,
    ...(typeof role === 'object' && role ? role : { perm: role }),
  }));
}

function normalizeFamilies(input: any) {
  const entries = input instanceof Map ? Array.from(input.entries()) : (Array.isArray(input) ? input : Object.entries(input || {}));
  return entries.map(([family, perms]: [string, any]) => [
    family,
    Array.isArray(perms) ? perms : Object.values(perms || {}),
  ]) as [string, any[]][];
}

function toBigIntValue(value: any): bigint {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? BigInt(Math.trunc(value)) : 0n;
  if (typeof value === 'string') {
    const text = value.trim();
    if (!text) return 0n;
    try {
      return BigInt(text);
    } catch {
      return 0n;
    }
  }
  if (value && typeof value === 'object') {
    if (value.$numberLong) return toBigIntValue(value.$numberLong);
    if (typeof value.toString === 'function') {
      const text = value.toString();
      if (text && text !== '[object Object]') return toBigIntValue(text);
    }
  }
  return 0n;
}

function bitIndex(value: any) {
  let numeric = toBigIntValue(value);
  if (numeric <= 0n) return 0;
  let index = 0;
  while (numeric > 1n) {
    numeric >>= 1n;
    index++;
  }
  return index;
}

function hasPerm(rolePerm: any, permKey: any) {
  try {
    return (toBigIntValue(rolePerm) & toBigIntValue(permKey)) !== 0n;
  } catch {
    return false;
  }
}

export default function DomainPermissionPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const roles = useMemo(() => normalizeRoles(args.roles), [args.roles]);
  const families = useMemo(() => normalizeFamilies(args.PERMS_BY_FAMILY), [args.PERMS_BY_FAMILY]);
  const [selected, setSelected] = useState<Record<string, Set<number>>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    const next: Record<string, Set<number>> = {};
    for (const role of roles) {
      const values = new Set<number>();
      for (const [, perms] of families) {
        for (const perm of perms as any[]) {
          const index = bitIndex(perm.key);
          if (hasPerm(role.perm, perm.key)) values.add(index);
        }
      }
      next[role._id] = values;
    }
    setSelected(next);
  }, [roles, families]);

  const toggle = (roleId: string, value: number, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev[roleId] || []);
      if (checked) next.add(value);
      else next.delete(value);
      return { ...prev, [roleId]: next };
    });
  };

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const payload = Object.fromEntries(roles.map((role: any) => [
        role._id,
        [1000, ...Array.from(selected[role._id] || [])],
      ]));
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else if (data.redirect) window.location.href = data.redirect;
      else setSuccess(t('Saved'));
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Permissions')}>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Update Permission')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}
      <Paper withBorder className="hydro-content-card">
        {!roles.length || !families.length ? (
          <Text c="dimmed" size="sm" p="md">{t('Permissions data is incomplete')}</Text>
        ) : (
          <ScrollArea>
            <Table striped highlightOnHover withColumnBorders miw={720}>
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>{t('Permissions')}</Table.Th>
                  {roles.map((role: any) => (
                    <Table.Th key={role._id} ta="center">
                      <Badge variant={role._id === 'root' ? 'filled' : 'light'}>{role._id}</Badge>
                    </Table.Th>
                  ))}
                </Table.Tr>
              </Table.Thead>
              {families.map(([family, perms]: [string, any[]]) => (
                <Table.Tbody key={family}>
                  <Table.Tr>
                    <Table.Td colSpan={roles.length + 1} bg="var(--hydro-surface-muted)">
                      <Text fw={700} size="sm">{t(family)}</Text>
                    </Table.Td>
                  </Table.Tr>
                  {perms.map((perm: any) => {
                    const index = bitIndex(perm.key);
                    return (
                      <Table.Tr key={perm.desc || perm.key}>
                        <Table.Td>
                          <Text size="sm">{t(perm.desc || String(perm.key))}</Text>
                        </Table.Td>
                        {roles.map((role: any) => (
                          <Table.Td key={role._id} ta="center">
                            <Checkbox
                              aria-label={`${role._id} ${perm.desc || perm.key}`}
                              checked={selected[role._id]?.has(index) || false}
                              disabled={role._id === 'root'}
                              onChange={(e) => toggle(role._id, index, e.currentTarget.checked)}
                            />
                          </Table.Td>
                        ))}
                      </Table.Tr>
                    );
                  })}
                </Table.Tbody>
              ))}
            </Table>
          </ScrollArea>
        )}
        <Group justify="flex-end" p="md">
          <Button onClick={handleSave} loading={loading} disabled={!roles.length || !families.length}>{t('Update Permission')}</Button>
        </Group>
      </Paper>
    </Stack>
  );
}
