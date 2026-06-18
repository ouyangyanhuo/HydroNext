import { Anchor, Group, Text } from '@mantine/core';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-[var(--hydro-border)] bg-[var(--hydro-surface)]">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <Text size="sm" c="dimmed">
            &copy; 2026 Magneto. {t('Powered by')}{' '}
            <Anchor href="https://hydro.ac" target="_blank" rel="noopener" size="sm">
              Hydro
            </Anchor>
          </Text>
          <Group gap="md">
            <Anchor component={Link} to="about" size="sm" c="dimmed">
              {t('About')}
            </Anchor>
            <Anchor component={Link} to="wiki_help" size="sm" c="dimmed">
              {t('Help')}
            </Anchor>
            <Anchor href="https://github.com/ouyangyanhuo/HydroNext" target="_blank" rel="noopener" size="sm" c="dimmed">
              GitHub
            </Anchor>
          </Group>
        </div>
      </div>
    </footer>
  );
}
