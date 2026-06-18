import { Button, Menu, Text } from '@mantine/core';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';

const LANGUAGES = [
  { code: 'zh', name: '简体中文', flag: '🇨🇳' },
  { code: 'en', name: 'English', flag: '🇬🇧' },
  { code: 'zh_TW', name: '繁體中文', flag: '🇹🇼' },
  { code: 'ko', name: '한국어', flag: '🇰🇷' },
];

export function LanguageMenu() {
  const language = useSessionStore((s) => s.language);
  const { t } = useI18n();

  const currentLang = LANGUAGES.find((l) => l.code === language) || LANGUAGES[0];

  const handleChange = async (langCode: string) => {
    // Update local state immediately
    useSessionStore.getState().setLanguage(langCode);

    // Persist to backend
    try {
      await fetch(`/language/${langCode}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
    } catch { /* ignore */ }

    // Reload to get fresh locale data from backend
    window.location.reload();
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
            disabled={lang.code === language}
          >
            <Text size="sm">{lang.name}</Text>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
