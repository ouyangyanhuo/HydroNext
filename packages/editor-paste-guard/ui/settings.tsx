import { useI18n } from '@hydrooj/ui-next';
import { Checkbox, NumberInput, Stack, Text } from '@mantine/core';
import { type ReactNode, useState } from 'react';
import { DEFAULT_PASTE_LIMIT, PASTE_LIMIT_KEY, resolvePasteLimit } from '../config';

export function PasteLimitSetting({ setting, value, onChange, children }: {
  setting: { key: string, flag?: number };
  value: number | string;
  onChange: (value: number | string) => void;
  children: ReactNode;
}) {
  const { t } = useI18n();
  const [lastLimit, setLastLimit] = useState(() => resolvePasteLimit(value) < 0 ? DEFAULT_PASTE_LIMIT : resolvePasteLimit(value));
  if (setting.key !== PASTE_LIMIT_KEY) return children;
  const enabled = value !== -1 && value !== '-1';
  const disabled = !!((setting.flag || 0) & 2);
  return <Stack gap="sm">
    <Text size="sm" fw={500}>{t('Code paste limit')}</Text>
    <Checkbox
      label={t('Enable code paste limit')}
      description={t('Disable the limit to allow unrestricted pasting. Set 0 to block all pasting.')}
      checked={enabled}
      disabled={disabled}
      onChange={(event) => onChange(event.currentTarget.checked ? lastLimit : -1)}
    />
    <NumberInput
      label={t('Maximum pasted characters')}
      value={enabled ? value : lastLimit}
      min={0}
      max={Number.MAX_SAFE_INTEGER}
      allowDecimal={false}
      allowNegative={false}
      clampBehavior="strict"
      required={enabled}
      disabled={disabled || !enabled}
      onChange={(next) => {
        if (typeof next === 'number') setLastLimit(next);
        onChange(next);
      }}
    />
  </Stack>;
}
