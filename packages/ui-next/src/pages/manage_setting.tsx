import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Checkbox, Group, PasswordInput, Select, SimpleGrid, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';

const FLAG_HIDDEN = 1;
const FLAG_DISABLED = 2;
const FLAG_SECRET = 4;

function normalizeSettings(settings: any, current: Record<string, any>) {
  if (Array.isArray(settings)) return settings;
  return Object.entries(settings || {}).map(([key, value]) => ({
    key,
    name: key,
    value,
    type: typeof value === 'boolean' ? 'boolean' : 'text',
    family: 'setting_basic',
  })).map((item: any) => ({ ...item, value: current[item.key] ?? item.value }));
}

function groupByFamily(settings: any[]) {
  const groups = new Map<string, any[]>();
  for (const setting of settings) {
    if (setting.family === 'setting_storage') continue;
    if ((setting.flag || 0) & FLAG_HIDDEN) continue;
    groups.set(setting.family || 'setting_basic', [...(groups.get(setting.family || 'setting_basic') || []), setting]);
  }
  return Array.from(groups.entries());
}

function setNested(target: Record<string, any>, key: string, value: any) {
  const parts = key.split('.');
  let cursor = target;
  for (const part of parts.slice(0, -1)) {
    cursor[part] ||= {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
}

function buildPayload(values: Record<string, any>, booleanKeys: string[]) {
  const payload: Record<string, any> = {};
  for (const [key, value] of Object.entries(values)) setNested(payload, key, value);
  payload.booleanKeys = {};
  for (const key of booleanKeys) setNested(payload.booleanKeys, key, true);
  return payload;
}

function optionData(range: any) {
  if (!range) return [];
  if (Array.isArray(range)) return range.map((item) => ({ value: String(item), label: String(item) }));
  return Object.entries(range).map(([value, label]) => ({ value, label: String(label) }));
}

function SettingInput({
  setting,
  value,
  onChange,
}: {
  setting: any;
  value: any;
  onChange: (value: any) => void;
}) {
  const { t } = useI18n();
  const disabled = ((setting.flag || 0) & FLAG_DISABLED) !== 0;
  const secret = ((setting.flag || 0) & FLAG_SECRET) !== 0;
  const label = t(setting.name || setting.key);
  const description = setting.desc ? t(setting.desc) : '';

  if (setting.type === 'boolean') {
    return (
      <Checkbox
        label={label}
        description={description}
        checked={!!value}
        disabled={disabled}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
    );
  }

  if (setting.type === 'select' || setting.type === 'radio' || setting.type === 'image_radio') {
    return (
      <Select
        label={label}
        description={description}
        data={optionData(setting.range)}
        value={value == null ? '' : String(value)}
        disabled={disabled}
        searchable
        onChange={(next) => onChange(next || '')}
      />
    );
  }

  if (setting.type === 'textarea' || setting.type === 'markdown') {
    return (
      <Textarea
        label={label}
        description={description}
        value={value == null ? '' : String(value)}
        disabled={disabled}
        placeholder={secret ? t('(Not changed)') : undefined}
        minRows={setting.type === 'markdown' ? 8 : 4}
        autosize
        onChange={(e) => onChange(e.currentTarget.value)}
        styles={setting.subType === 'yaml' ? { input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } } : undefined}
      />
    );
  }

  const Input = setting.type === 'password' || secret ? PasswordInput : TextInput;
  return (
    <Input
      label={label}
      description={description}
      type={setting.type === 'number' || setting.type === 'float' ? 'number' : undefined}
      value={value == null ? '' : String(value)}
      disabled={disabled}
      placeholder={secret ? t('(Not changed)') : undefined}
      onChange={(e) => onChange(e.currentTarget.value)}
    />
  );
}

export default function ManageSettingPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const current = args.current || {};
  const settings = normalizeSettings(args.settings || {}, current);
  const [values, setValues] = useState(() => Object.fromEntries(settings.map((setting: any) => [
    setting.key,
    ((setting.flag || 0) & FLAG_SECRET) ? '' : (current[setting.key] ?? setting.value ?? ''),
  ])));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const groups = useMemo(() => groupByFamily(settings), [settings]);
  const booleanKeys = settings.filter((setting: any) => setting.type === 'boolean').map((setting: any) => setting.key);

  const handleSave = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(buildPayload(values, booleanKeys)),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else setSuccess(t('Saved'));
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('System Settings')}>
        <Button onClick={handleSave} loading={loading} size="xs">{t('Save All Changes')}</Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}
      {success && <Text c="green" size="sm">{success}</Text>}

      <Stack gap="lg">
        {groups.map(([family, items]) => (
          <Card key={family} withBorder p="lg" className="hydro-content-card">
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t(family)}</Title>
              <Badge variant="light">{items.length}</Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              {items.map((setting) => (
                <SettingInput
                  key={setting.key}
                  setting={setting}
                  value={values[setting.key]}
                  onChange={(value) => setValues((prev) => ({ ...prev, [setting.key]: value }))}
                />
              ))}
            </SimpleGrid>
          </Card>
        ))}
      </Stack>
    </Stack>
  );
}
