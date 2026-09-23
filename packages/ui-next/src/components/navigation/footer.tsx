import { Anchor, Group, Stack, Text, Tooltip } from '@mantine/core';
import { Link } from '@/components/link';
import { buildIdentifier, buildTime } from '@/globals';
import { useI18n } from '@/hooks/use-i18n';
import { FontMenu } from './font-menu';
import { LanguageMenu } from './language-menu';

function formatBuildTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat(undefined, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

export function Footer() {
  const { t } = useI18n();
  const formattedBuildTime = formatBuildTime(buildTime);

  return (
    <footer className="border-t border-[var(--hydro-border)] bg-[var(--hydro-nav-bg)]">
      <div className="hydro-container py-8">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <Group gap={7} align="center">
              <Text size="sm" fw={700} className="text-[var(--hydro-text)]">
                Magneto
              </Text>
              {buildIdentifier ? (
                <Tooltip
                  label={(
                    <Stack gap={5}>
                      <div>
                        <Text size="10px" c="dimmed" fw={700}>{t('Version')}</Text>
                        <Text size="xs" ff="monospace" className="break-all">{buildIdentifier}</Text>
                      </div>
                      {formattedBuildTime ? (
                        <div>
                          <Text size="10px" c="dimmed" fw={700}>{t('Build Time')}</Text>
                          <Text size="xs" ff="monospace">{formattedBuildTime}</Text>
                        </div>
                      ) : null}
                    </Stack>
                  )}
                  position="top-start"
                  openDelay={180}
                  withArrow
                  multiline
                  maw={360}
                >
                  <Text
                    component="span"
                    tabIndex={0}
                    size="10px"
                    c="dimmed"
                    aria-label={`${t('Version')}: ${buildIdentifier}${formattedBuildTime ? `; ${t('Build Time')}: ${formattedBuildTime}` : ''}`}
                    className="cursor-help select-none border-b border-dotted border-[var(--hydro-text-muted)] leading-none"
                  >
                    {t('Version')}
                  </Text>
                </Tooltip>
              ) : null}
            </Group>
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
            <Anchor component={Link} to="wiki_about" size="sm" className="text-[var(--hydro-text-muted)] transition-colors duration-150 hover:text-[var(--hydro-primary)]">
              {t('About')}
            </Anchor>
            <Anchor component={Link} to="wiki_help" size="sm" className="text-[var(--hydro-text-muted)] transition-colors duration-150 hover:text-[var(--hydro-primary)]">
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
