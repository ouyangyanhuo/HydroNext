/* eslint-disable react-refresh/only-export-components */
import {
  Avatar,
  Card,
  Checkbox,
  Group,
  PasswordInput,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core';
import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/common/button';
import { LongSelect, TagMultiSelect } from '@/components/common/select';
import { useI18n } from '@/hooks/use-i18n';

const FALLBACK_LANG_DISPLAY: Record<string, string> = {
  bash: 'Bash',
  c: 'C',
  cc: 'C++',
  'cc.cc98': 'C++98',
  'cc.cc98o2': 'C++98(O2)',
  'cc.cc11': 'C++11',
  'cc.cc11o2': 'C++11(O2)',
  'cc.cc14': 'C++14',
  'cc.cc14o2': 'C++14(O2)',
  'cc.cc17': 'C++17',
  'cc.cc17o2': 'C++17(O2)',
  'cc.cc20': 'C++20',
  'cc.cc20o2': 'C++20(O2)',
  cs: 'C#',
  go: 'Golang',
  hs: 'Haskell',
  java: 'Java',
  js: 'NodeJS',
  kt: 'Kotlin',
  'kt.jvm': 'Kotlin/JVM',
  pas: 'Pascal',
  php: 'PHP',
  py: 'Python',
  'py.py2': 'Python 2',
  'py.py3': 'Python 3',
  'py.pypy3': 'PyPy3',
  r: 'R',
  rb: 'Ruby',
  rs: 'Rust',
  ts: 'TypeScript',
};

function getLocalLangDisplay(lang: string): string {
  return FALLBACK_LANG_DISPLAY[lang] || lang;
}

const FLAG_HIDDEN = 1;
const FLAG_DISABLED = 2;
const FLAG_SECRET = 4;
const EMPTY_KEYS: string[] = [];

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
  variant?: 'default' | 'personal' | 'grid';
  /** Browser-local controls are rendered with a family but never added to the server payload. */
  familyExtras?: Record<string, ReactNode>;
  itemIcons?: Record<string, any>;
  booleanGrid?: boolean;
  fieldsGrid?: boolean;
  /** Display these boolean controls positively while preserving their storage semantics. */
  invertedBooleanKeys?: readonly string[];
  /** Storage values for local previews; this callback never submits the form. */
  onValuesChange?: (values: Record<string, any>) => void;
}

function getDomainAvatarUrl(avatar?: string) {
  if (!avatar) return undefined;
  if (avatar.startsWith('http://') || avatar.startsWith('https://') || avatar.startsWith('/')) return avatar;
  if (avatar.startsWith('url:')) return avatar.slice(4);
  return undefined;
}

function getByPath(source: Record<string, any>, key: string) {
  if (!source) return undefined;
  if (Object.hasOwn(source, key)) return source[key];
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

  if (setting.key === 'langs') {
    const rawLangs = (typeof window !== 'undefined' && (window as any).LANGS) || {};
    const options = Object.entries<any>(rawLangs)
      .filter(([, val]) => !val?.hidden && !val?.disabled)
      .map(([k, val]) => ({ value: k, label: val?.display || getLocalLangDisplay(k) }));
    const data = options.length > 0
      ? options
      : Object.entries(FALLBACK_LANG_DISPLAY).map(([val, lbl]) => ({ value: val, label: lbl }));

    const selected = typeof value === 'string'
      ? value.split(',').map((s) => s.trim()).filter(Boolean)
      : (Array.isArray(value) ? value.map(String) : []);

    for (const item of selected) {
      if (!data.some((d) => d.value === item)) {
        data.push({ value: item, label: getLocalLangDisplay(item) });
      }
    }

    return (
      <TagMultiSelect
        label={label || t('Allowed langs')}
        placeholder={t('Leave blank to allow all languages')}
        data={data}
        value={selected}
        disabled={disabled}
        searchable
        clearable
        onChange={(next) => onChange((next || []).join(','))}
      />
    );
  }

  if (setting.key === 'avatar') {
    const avatarUrl = getDomainAvatarUrl(value);
    const displayInitial = (label || 'D').charAt(0).toUpperCase();

    return (
      <TextInput
        label={label}
        description={description}
        value={value == null ? '' : String(value)}
        disabled={disabled}
        placeholder={secret ? t('(Not changed)') : 'https://...'}
        leftSection={(
          <Avatar
            src={avatarUrl}
            color="hydroTeal"
            size={20}
            radius="xl"
            variant="light"
          >
            {displayInitial}
          </Avatar>
        )}
        onChange={(e) => {
          const val = e.currentTarget.value;
          onChange(val);
        }}
      />
    );
  }

  if (setting.type === 'select' || setting.type === 'radio' || setting.type === 'image_radio') {
    return (
      <LongSelect
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
  excludeKeys = EMPTY_KEYS,
  variant = 'default',
  familyExtras,
  itemIcons,
  booleanGrid = false,
  fieldsGrid = false,
  invertedBooleanKeys = EMPTY_KEYS,
  onValuesChange,
}: SettingsFormProps) {
  const { t } = useI18n();
  const normalized = useMemo(
    () => normalizeSettings(settings, current).filter((s) => !excludeKeys.includes(s.key)),
    [settings, current, excludeKeys],
  );
  const invertedKeys = useMemo(() => new Set(normalized
    .filter((setting) => setting.type === 'boolean' && invertedBooleanKeys.includes(setting.key))
    .map((setting) => setting.key)), [normalized, invertedBooleanKeys]);
  const [values, setValues] = useState<Record<string, any>>(() => Object.fromEntries(
    normalized.map((setting) => {
      const currentValue = getByPath(current, setting.key);
      const value = ((setting.flag || 0) & FLAG_SECRET) ? '' : (currentValue ?? setting.value ?? '');
      return [
        setting.key,
        invertedKeys.has(setting.key) ? !value : value,
      ];
    }),
  ));
  const storageValues = useMemo(() => Object.fromEntries(Object.entries(values)
    .map(([key, value]) => [key, invertedKeys.has(key) ? !value : value])), [values, invertedKeys]);

  useEffect(() => {
    onValuesChange?.(storageValues);
  }, [storageValues, onValuesChange]);
  const groups = useMemo(() => {
    const grouped = groupByFamily(normalized);
    for (const family of Object.keys(familyExtras || {})) {
      if (!grouped.some(([key]) => key === family)) grouped.push([family, []]);
    }
    return grouped;
  }, [normalized, familyExtras]);
  const booleanKeys = useMemo(
    () => normalized
      .filter((setting) => setting.type === 'boolean' && !((setting.flag || 0) & FLAG_HIDDEN))
      .map((setting) => setting.key),
    [normalized],
  );

  const handleSubmit = async () => {
    await onSubmit(buildSettingsPayload(storageValues, booleanKeys, payloadMode, extraPayload));
  };

  return (
    <Stack gap="lg" className={variant === 'personal' ? 'hydro-settings-form' : undefined}>
      {groups.map(([family, items]) => (
        <Card
          key={family}
          withBorder
          p="lg"
          className={variant === 'personal' ? 'hydro-content-card hydro-settings-section' : 'hydro-content-card'}
        >
          {variant === 'personal' ? (
            <div className="hydro-settings-section__header">
              <Title order={3} size="h4">{t(family)}</Title>
            </div>
          ) : (
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t(family)}</Title>
            </Group>
          )}
          {booleanGrid && items.length === 1 && items[0].type === 'boolean' ? (
            <div>
              {(() => {
                const setting = items[0];
                const value = !!values[setting.key];
                const disabled = ((setting.flag || 0) & FLAG_DISABLED) !== 0;
                const label = t(setting.name || setting.key);
                const description = setting.desc ? t(setting.desc) : '';
                const IconComponent = itemIcons?.[setting.key];

                return (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      if (!disabled) {
                        setValues((prev) => ({ ...prev, [setting.key]: !value }));
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
                        e.preventDefault();
                        setValues((prev) => ({ ...prev, [setting.key]: !value }));
                      }
                    }}
                    className={[
                      'hydro-setting-checkbox-card hydro-setting-checkbox-card--feature',
                      value ? 'hydro-setting-checkbox-card--checked' : '',
                      disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="flex items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5 min-w-0 flex-1">
                        {IconComponent && (
                          <div className="hydro-setting-checkbox-card__icon hydro-setting-checkbox-card__icon--feature">
                            <IconComponent size={22} stroke={2} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Text size="sm" fw="var(--hydro-weight-semibold)" className="leading-snug">
                            {label}
                          </Text>
                          {description ? (
                            <Text size="xs" c="dimmed" className="mt-1 leading-normal">
                              {description}
                            </Text>
                          ) : null}
                        </div>
                      </div>
                      <Switch
                        checked={value}
                        disabled={disabled}
                        size="md"
                        readOnly
                        tabIndex={-1}
                        aria-hidden="true"
                        className="pointer-events-none shrink-0"
                      />
                    </div>
                  </div>
                );
              })()}
              {familyExtras?.[family] && (
                <div className="mt-3">{familyExtras[family]}</div>
              )}
            </div>
          ) : booleanGrid && items.length > 1 && items.every((s) => s.type === 'boolean') ? (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {items.map((setting) => {
                  const value = !!values[setting.key];
                  const disabled = ((setting.flag || 0) & FLAG_DISABLED) !== 0;
                  const label = t(setting.name || setting.key);
                  const description = setting.desc ? t(setting.desc) : '';
                  const IconComponent = itemIcons?.[setting.key];

                  return (
                    <div
                      key={setting.key}
                      role="button"
                      tabIndex={0}
                      onClick={() => {
                        if (!disabled) {
                          setValues((prev) => ({ ...prev, [setting.key]: !value }));
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === ' ' || e.key === 'Enter') && !disabled) {
                          e.preventDefault();
                          setValues((prev) => ({ ...prev, [setting.key]: !value }));
                        }
                      }}
                      className={[
                        'hydro-setting-checkbox-card',
                        value ? 'hydro-setting-checkbox-card--checked' : '',
                        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                      ].filter(Boolean).join(' ')}
                    >
                      <div className="flex items-center gap-3">
                        {IconComponent && (
                          <div className="hydro-setting-checkbox-card__icon">
                            <IconComponent size={18} stroke={1.8} />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <Text size="sm" fw="var(--hydro-weight-medium)" className="leading-snug" truncate>
                            {label}
                          </Text>
                          {description ? (
                            <Text size="xs" c="dimmed" className="mt-0.5 line-clamp-2">
                              {description}
                            </Text>
                          ) : null}
                        </div>
                        <Checkbox
                          checked={value}
                          disabled={disabled}
                          readOnly
                          tabIndex={-1}
                          aria-hidden="true"
                          className="pointer-events-none shrink-0"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
              {familyExtras?.[family] && (
                <div className="mt-3">{familyExtras[family]}</div>
              )}
            </div>
          ) : (
            <div
              className={variant === 'personal' || variant === 'grid' || fieldsGrid
                ? 'hydro-settings-fields'
                : 'flex flex-col gap-4'}
            >
              {items.map((setting) => {
                const isWide = setting.type === 'markdown'
                  || setting.type === 'textarea'
                  || setting.type === 'json'
                  || setting.key === 'bulletin'
                  || (variant === 'personal' && setting.type === 'boolean');

                return (
                  <div
                    key={setting.key}
                    className={(variant === 'personal' || variant === 'grid' || fieldsGrid) && isWide
                      ? 'hydro-settings-field hydro-settings-field--wide'
                      : 'hydro-settings-field'}
                  >
                    <SettingInput
                      setting={setting}
                      value={values[setting.key]}
                      onChange={(value) => setValues((prev) => ({ ...prev, [setting.key]: value }))}
                    />
                  </div>
                );
              })}
              {familyExtras?.[family] && (
                <div className="hydro-settings-field hydro-settings-field--wide">{familyExtras[family]}</div>
              )}
            </div>
          )}
        </Card>
      ))}
      <Group
        justify={variant === 'personal' ? 'space-between' : 'flex-end'}
        className={variant === 'personal' ? 'hydro-settings-savebar' : undefined}
      >
        {variant === 'personal' ? <Text size="xs" c="dimmed">{t('Save All Changes')}</Text> : null}
        <Button onClick={handleSubmit} loading={loading} className="hydro-settings-save">
          {submitLabel || t('Save All Changes')}
        </Button>
      </Group>
    </Stack>
  );
}
