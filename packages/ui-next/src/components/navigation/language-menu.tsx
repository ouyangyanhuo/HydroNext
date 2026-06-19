import { Button, Menu, Text } from '@mantine/core';
import { IconLanguage } from '@tabler/icons-react';
import { useSessionStore } from '@/stores/session';

const LANGUAGES = [
  { code: 'zh', name: '简体中文' },
  { code: 'zh_TW', name: '繁體中文' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'ko', name: '한국어' },
];

export function LanguageMenu() {
  const language = useSessionStore((s) => s.language);

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const handleChange = (langCode: string) => {
    window.location.href = `/language/${langCode}`;
  };

  return (
    <Menu shadow="md" width={160}>
      <Menu.Target>
        <Button variant="subtle" size="xs" px="xs" leftSection={<IconLanguage size={16} />}>
          {currentLang.name}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {LANGUAGES.map((lang) => (
          <Menu.Item
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            fw={lang.code === language ? 700 : 400}
          >
            <Text size="sm">{lang.name}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
