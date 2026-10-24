import { Badge, Group, Text } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useMemo, useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { normalizeSettings, SettingsForm } from '@/components/common/settings-form';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

const FAMILY_DESCRIPTIONS: Record<string, string> = {
  setting_basic: 'setting_basic_desc',
  setting_server: 'setting_server_desc',
  setting_smtp: 'setting_smtp_desc',
  setting_limits: 'setting_limits_desc',
  setting_session: 'setting_session_desc',
};

export default function ManageSettingPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const current = args.current;
  const settings = args.settings;
  const [loading, setLoading] = useState(false);

  const normalized = useMemo(
    () => normalizeSettings(settings || {}, current || {}),
    [settings, current],
  );

  const categoryCount = useMemo(() => {
    const families = new Set<string>();
    for (const item of normalized) {
      families.add(item.family || 'setting_basic');
    }
    return families.size;
  }, [normalized]);

  const handleSave = async (payload: Record<string, any>) => {
    setLoading(true);
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        notifications.show({ title: formatErrorMessage(data.error, t('Save failed')), message: '', color: 'red' });
      } else {
        notifications.show({ title: t('Saved'), message: '', color: 'green' });
      }
    } catch (err: any) {
      notifications.show({ title: err?.message || t('Network error'), message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="hydro-settings-page">
      <div className="hydro-settings-header">
        <Group justify="space-between" align="center" wrap="wrap" gap="md">
          <div>
            <Button
              component={Link}
              to="manage_dashboard"
              variant="subtle"
              size="xs"
              mb={6}
              px={0}
            >
              {t('System Management')}
            </Button>
            <PageHeader title={t('System Settings')} />
            <Text size="sm" c="dimmed" mt={4}>
              {t('Runtime settings grouped by feature.')}
            </Text>
          </div>
          <Group gap="xs">
            <Badge variant="light" size="lg" radius="md">
              {categoryCount} {t('All Categories')}
            </Badge>
            <Badge variant="outline" size="lg" radius="md">
              {normalized.length} {t('Settings')}
            </Badge>
          </Group>
        </Group>
      </div>

      <div className="hydro-settings-content">
        <SettingsForm
          settings={args.settings || {}}
          current={current}
          payloadMode="nested"
          fieldsGrid
          booleanGrid
          separateBooleanFields
          textareaHeight={240}
          loading={loading}
          onSubmit={handleSave}
          stickySaveBar
          familyDescriptions={FAMILY_DESCRIPTIONS}
        />
      </div>
    </main>
  );
}
