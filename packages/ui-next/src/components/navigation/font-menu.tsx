import { Button, Menu } from '@mantine/core';
import { IconLetterA } from '@tabler/icons-react';
import { useI18n } from '@/hooks/use-i18n';
import { type FontFamily, useSessionStore } from '@/stores/session';

const FONT_OPTIONS: { value: FontFamily; labelKey: string }[] = [
  { value: 'sans', labelKey: 'Sans-serif' },
  { value: 'serif', labelKey: 'Serif' },
];

export function FontMenu() {
  const fontFamily = useSessionStore((s) => s.fontFamily);
  const setFontFamily = useSessionStore((s) => s.setFontFamily);
  const { t } = useI18n();

  const current = FONT_OPTIONS.find((f) => f.value === fontFamily) || FONT_OPTIONS[0];

  return (
    <Menu shadow="md" width={160}>
      <Menu.Target>
        <Button variant="subtle" size="xs" px="xs" leftSection={<IconLetterA size={16} />}>
          {t(current.labelKey)}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {FONT_OPTIONS.map((opt) => (
          <Menu.Item
            key={opt.value}
            onClick={() => setFontFamily(opt.value)}
            fw={opt.value === fontFamily ? 700 : 400}
          >
            {t(opt.labelKey)}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
