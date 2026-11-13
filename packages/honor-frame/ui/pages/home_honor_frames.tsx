import { Link, PageHeader, useBuildUrl, useI18n } from '@hydrooj/ui-next';
import { Text } from '@mantine/core';
import { IconBuildingCommunity, IconSettings, IconUserCircle } from '@tabler/icons-react';
import { HonorFramePanel } from '../components/user/honor-frame-panel';

export default function HomeHonorFramesPage() {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const honorFrameHref = buildUrl('home_honor_frames');
  return <main className="hydro-settings-page">
    <div className="hydro-settings-header"><PageHeader title={t('Settings')} /><Text c="dimmed" size="sm">{t('Honor avatar frame')}</Text></div>
    <div className="hydro-settings-layout">
      <nav className="hydro-settings-nav" aria-label={t('Settings')}>
        {[
          { key: 'preference', title: 'Preference', Icon: IconSettings },
          { key: 'account', title: 'Account', Icon: IconUserCircle },
          { key: 'domain', title: 'Domain', Icon: IconBuildingCommunity },
        ].map(({ key, title, Icon }) => {
          const settingsHref = buildUrl('home_settings', { category: key });
          return (
            <Link
              key={key}
              to="home_settings"
              params={{ category: key }}
              href={settingsHref === '#' ? `/home/settings/${key}` : settingsHref}
              className="hydro-settings-nav__item"
            >
              <Icon size={18} /><span>{t(title)}</span>
            </Link>
          );
        })}
        <Link
          to="home_honor_frames"
          href={honorFrameHref === '#' ? '/home/honor-frames' : honorFrameHref}
          aria-current="page"
          className="hydro-settings-nav__item"
        >
          <IconUserCircle size={18} /><span>{t('Honor avatar frame')}</span>
        </Link>
      </nav>
      <div className="hydro-settings-content"><HonorFramePanel /></div>
    </div>
  </main>;
}
