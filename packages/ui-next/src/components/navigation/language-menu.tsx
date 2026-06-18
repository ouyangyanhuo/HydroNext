import { Button, Menu, Text } from '@mantine/core';
import { useSessionStore } from '@/stores/session';

const LANGUAGES = [
  { code: 'zh', name: '简体中文', flag: '🇨🇳' },
  { code: 'zh_TW', name: '繁體中文', flag: '🇹🇼' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'ja', name: '日本語', flag: '🇯🇵' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
];

export function LanguageMenu() {
  const language = useSessionStore((s) => s.language);

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const handleChange = (langCode: string) => {
    // Navigate to the backend language switch endpoint
    // The backend will persist the language to session/db and redirect back
    window.location.href = `/language/${langCode}`;
  };

  return (
    <Menu shadow="md" width={160}>
      <Menu.Target>
        <Button variant="subtle" size="xs" px="xs">
          {currentLang.flag}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {LANGUAGES.map((lang) => (
          <Menu.Item
            key={lang.code}
            onClick={() => handleChange(lang.code)}
            leftSection={lang.flag}
            fw={lang.code === language ? 700 : 400}
          >
            <Text size="sm">{lang.name}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
