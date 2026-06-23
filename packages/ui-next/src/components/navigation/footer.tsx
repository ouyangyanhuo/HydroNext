import { Anchor, Group, Text } from '@mantine/core';
import { Link } from '@/components/link';
import { useI18n } from '@/hooks/use-i18n';
import { FontMenu } from './font-menu';
import { LanguageMenu } from './language-menu';

export function Footer() {
  const { t } = useI18n();

  return (
    <footer className="border-t border-[var(--hydro-border)] bg-[var(--hydro-nav-bg)]">
      <div className="hydro-container py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <Text size="sm" fw={700} className="text-[var(--hydro-text)]">
              Magneto
            </Text>
            <Text size="xs" c="dimmed">
              &copy; 2026. {t('Powered by')}{' '}
              <Anchor href="#" rel="noopener" size="xs">
                Hydro
              </Anchor>
            </Text>
          </div>
          <Group gap="lg">
            <FontMenu />
            <LanguageMenu />
            <Anchor component={Link} href="/wiki/about" size="sm" className="text-[var(--hydro-text-muted)] transition-colors duration-150 hover:text-[var(--hydro-primary)]">
              {t('About')}
            </Anchor>
            <Anchor component={Link} href="/wiki/help" size="sm" className="text-[var(--hydro-text-muted)] transition-colors duration-150 hover:text-[var(--hydro-primary)]">
              {t('Help')}
            </Anchor>
            <Anchor href="https://github.com/ouyangyanhuo/HydroNext" target="_blank" rel="noopener" size="sm" className="text-[var(--hydro-text-muted)] transition-colors duration-150 hover:text-[var(--hydro-primary)]">
              GitHub
            </Anchor>
          </Group>
        </div>
      </div>
    </footer>
  );
}
