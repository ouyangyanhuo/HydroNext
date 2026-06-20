import {
  Badge,
  Button,
  Card,
  Checkbox,
  Group,
  PasswordInput,
  Select,
  SimpleGrid,
  Stack,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { useI18n } from '@/hooks/use-i18n';

const FLAG_HIDDEN = 1;
const FLAG_DISABLED = 2;
const FLAG_SECRET = 4;

type PayloadMode = 'flat' | 'nested';

interface SettingItem {
  family?: string;
  key: string;
  name?: string;
  desc?: string;
  value?: any;
  type?: string;
  range?: any;
  flag?: number;
  subType?: string;
}

interface SettingsFormProps {
  settings: SettingItem[] | Record<string, any>;
  current?: Record<string, any>;
  payloadMode?: PayloadMode;
  extraPayload?: Record<string, any>;
  submitLabel?: string;
  loading?: boolean;
  onSubmit: (payload: Record<string, any>) => void | Promise<void>;
  excludeKeys?: string[];
}

function getByPath(source: Record<string, any>, key: string) {
  if (!source) return undefined;
  if (Object.prototype.hasOwnProperty.call(source, key)) return source[key];
  return key.split('.').reduce((cursor, part) => (cursor == null ? undefined : cursor[part]), source);
}

export function normalizeSettings(settings: SettingsFormProps['settings'], current: Record<string, any> = {}) {
  if (Array.isArray(settings)) return settings;
  return Object.entries(settings || {}).map(([key, value]) => ({
    key,
    name: key,
    value: getByPath(current, key) ?? value,
    type: typeof value === 'boolean' ? 'boolean' : 'text',
    family: 'setting_basic',
  }));
}

function groupByFamily(settings: SettingItem[]) {
  const groups = new Map<string, SettingItem[]>();
  for (const setting of settings) {
    if (setting.family === 'setting_storage') continue;
    if (setting.family === 'setting_customize') continue;
    if ((setting.flag || 0) & FLAG_HIDDEN) continue;
    const family = setting.family || 'setting_basic';
    groups.set(family, [...(groups.get(family) || []), setting]);
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

export function buildSettingsPayload(
  values: Record<string, any>,
  booleanKeys: string[],
  mode: PayloadMode = 'nested',
  extraPayload: Record<string, any> = {},
) {
  const payload: Record<string, any> = { ...extraPayload };
  if (mode === 'flat') {
    Object.assign(payload, values);
    payload.booleanKeys = Object.fromEntries(booleanKeys.map((key) => [key, true]));
    return payload;
  }
  for (const [key, value] of Object.entries(values)) setNested(payload, key, value);
  payload.booleanKeys = {};
  for (const key of booleanKeys) setNested(payload.booleanKeys, key, true);
  return payload;
}

function optionData(range: any) {
  if (!range) return [];
  if (Array.isArray(range)) {
    return range.map((item) => {
      if (Array.isArray(item)) return { value: String(item[0]), label: String(item[1] ?? item[0]) };
      return { value: String(item), label: String(item) };
    });
  }
  return Object.entries(range).map(([value, label]) => ({ value, label: String(label) }));
}

function SettingInput({
  setting,
  value,
  onChange,
}: {
  setting: SettingItem;
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
        onChange={(e) => {
          const checked = e.currentTarget.checked;
          onChange(checked);
        }}
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

  if (setting.type === 'textarea' || setting.type === 'markdown' || setting.type === 'json') {
    return (
      <Textarea
        label={label}
        description={description}
        value={value == null ? '' : String(value)}
        disabled={disabled}
        placeholder={secret ? t('(Not changed)') : undefined}
        minRows={setting.type === 'markdown' || setting.subType === 'yaml' ? 8 : 4}
        autosize
        onChange={(e) => {
          const val = e.currentTarget.value;
          onChange(val);
        }}
        styles={setting.subType === 'yaml' || setting.type === 'json'
          ? { input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '13px' } }
          : undefined}
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
      onChange={(e) => {
        const val = e.currentTarget.value;
        onChange(val);
      }}
    />
  );
}

export function SettingsForm({
  settings,
  current = {},
  payloadMode = 'nested',
  extraPayload = {},
  submitLabel,
  loading = false,
  onSubmit,
  excludeKeys = [],
}: SettingsFormProps) {
  const { t } = useI18n();
  const normalized = useMemo(
    () => normalizeSettings(settings, current).filter((s) => !excludeKeys.includes(s.key)),
    [settings, current, excludeKeys],
  );
  const [values, setValues] = useState<Record<string, any>>({});
  const [initialized, setInitialized] = useState(false);
  const groups = useMemo(() => groupByFamily(normalized), [normalized]);
  const booleanKeys = useMemo(
    () => normalized
      .filter((setting) => setting.type === 'boolean' && !((setting.flag || 0) & FLAG_HIDDEN))
      .map((setting) => setting.key),
    [normalized],
  );

  useEffect(() => {
    if (!initialized && normalized.length > 0) {
      setValues(Object.fromEntries(normalized.map((setting) => {
        const currentValue = getByPath(current, setting.key);
        return [
          setting.key,
          ((setting.flag || 0) & FLAG_SECRET) ? '' : (currentValue ?? setting.value ?? ''),
        ];
      })));
      setInitialized(true);
    }
  }, [normalized, current, initialized]);

  const handleSubmit = async () => {
    await onSubmit(buildSettingsPayload(values, booleanKeys, payloadMode, extraPayload));
  };

  return (
    <Stack gap="lg">
      {groups.map(([family, items]) => (
        <Card key={family} withBorder p="lg" className="hydro-content-card">
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">{t(family)}</Title>
          </Group>
          <Stack gap="md">
            {items.map((setting) => (
              <SettingInput
                key={setting.key}
                setting={setting}
                value={values[setting.key]}
                onChange={(value) => setValues((prev) => ({ ...prev, [setting.key]: value }))}
              />
            ))}
          </Stack>
        </Card>
      ))}
      <Group justify="flex-end">
        <Button onClick={handleSubmit} loading={loading}>
          {submitLabel || t('Save All Changes')}
        </Button>
      </Group>
    </Stack>
  );
}
