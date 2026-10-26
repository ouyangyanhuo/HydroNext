import { useI18n } from '@hydrooj/ui-next';
import { NumberInput, Switch, Text } from '@mantine/core';
import { IconClipboard } from '@tabler/icons-react';
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
  const toggle = () => {
    if (disabled) return;
    if (enabled) {
      const current = resolvePasteLimit(value);
      if (current >= 0) setLastLimit(current);
    }
    onChange(enabled ? -1 : lastLimit);
  };
  return <div className="hydro-feature-setting-row">
    <div className={`hydro-feature-setting-card-wrap hydro-feature-setting-card-wrap--${enabled ? 'half' : 'full'}`}>
      <div
        role="switch"
        aria-label={t('Enable code paste limit')}
        aria-checked={enabled}
        aria-disabled={disabled}
        tabIndex={disabled ? -1 : 0}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === ' ' || event.key === 'Enter') {
            event.preventDefault();
            toggle();
          }
        }}
        className={[
          'hydro-setting-checkbox-card hydro-setting-checkbox-card--feature',
          enabled ? 'hydro-setting-checkbox-card--checked' : '',
          disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
        ].filter(Boolean).join(' ')}
      >
        <div className="flex items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="hydro-setting-checkbox-card__icon hydro-setting-checkbox-card__icon--feature">
              <IconClipboard size={22} stroke={2} aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <Text size="sm" fw="var(--hydro-weight-semibold)" className="leading-snug">
                {t('Enable code paste limit')}
              </Text>
              <Text size="xs" c="dimmed" className="mt-1 leading-normal">
                {t('Disable the limit to allow unrestricted pasting. Set 0 to block all pasting.')}
              </Text>
            </div>
          </div>
          <Switch
            checked={enabled}
            disabled={disabled}
            size="md"
            readOnly
            tabIndex={-1}
            aria-hidden="true"
            className="pointer-events-none shrink-0"
          />
        </div>
      </div>
    </div>
    {enabled && <div className="hydro-feature-setting-extra hydro-feature-setting-extra--open">
      <NumberInput
        label={t('Maximum pasted characters')}
        value={value}
        min={0}
        max={Number.MAX_SAFE_INTEGER}
        allowDecimal={false}
        allowNegative={false}
        clampBehavior="strict"
        required
        disabled={disabled}
        onChange={(next) => {
          if (typeof next === 'number') setLastLimit(next);
          onChange(next);
        }}
      />
    </div>}
  </div>;
}
