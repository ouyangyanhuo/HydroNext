import { Alert, Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconAward,
  IconCode,
  IconFlame,
  IconHistory,
  IconHome,
  IconInfoCircle,
  IconSchool,
  IconTrophy,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { SettingsForm } from '@/components/common/settings-form';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useDomainNavigationPreview } from '@/stores/domain-navigation-preview';
import { formatErrorMessage } from '@/utils/error';

const VISIBILITY_ICONS: Record<string, any> = {
  contestMode: IconFlame,
  'navigationHidden.homepage': IconHome,
  'navigationHidden.problem_main': IconCode,
  'navigationHidden.contest_main': IconTrophy,
  'navigationHidden.training_main': IconSchool,
  'navigationHidden.record_main': IconHistory,
  'navigationHidden.ranking': IconAward,
};

const VISIBILITY_LABELS: Record<string, string> = {
  'navigationHidden.homepage': 'Show Home navigation entry',
  'navigationHidden.problem_main': 'Show Problems navigation entry',
  'navigationHidden.contest_main': 'Show Contests navigation entry',
  'navigationHidden.training_main': 'Show Training navigation entry',
  'navigationHidden.record_main': 'Show Records navigation entry',
  'navigationHidden.ranking': 'Show Ranking navigation entry',
};
const INVERTED_KEYS = Object.keys(VISIBILITY_LABELS);

export function DomainSettingsPage({ visibility = false }: { visibility?: boolean }) {
  const { args } = usePageData();
  const { t } = useI18n();
  const current = args.current || args.domain || args.ddoc || {};
  const domainId = String(current._id || args.UiContext?.domainId || '');
  const previewOwner = useRef(Symbol('domain-navigation-preview'));
  const settings = useMemo(() => visibility && Array.isArray(args.settings)
    ? args.settings.map((setting) => VISIBILITY_LABELS[setting.key]
      ? { ...setting, name: VISIBILITY_LABELS[setting.key] } : setting)
    : args.settings || {}, [args.settings, visibility]);
  const [loading, setLoading] = useState(false);

  const previewChanges = useCallback((values: Record<string, any>) => {
    if (!visibility || !domainId) return;
    useDomainNavigationPreview.getState().setPreview({
      owner: previewOwner.current,
      domainId,
      contestMode: values.contestMode === true,
      navigationHidden: Object.fromEntries(INVERTED_KEYS.map((key) => [key.slice('navigationHidden.'.length), values[key] === true])),
    });
  }, [visibility, domainId]);

  useEffect(() => {
    const owner = previewOwner.current;
    return () => { useDomainNavigationPreview.getState().clearPreview(owner); };
  }, [visibility, domainId]);

  const handleSubmit = async (payload: Record<string, any>) => {
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
        notifications.show({ title: formatErrorMessage(data.error, t('Save failed'), t), message: '', color: 'red' });
      } else if (data.url || data.redirect) {
        window.location.href = data.url || data.redirect;
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
    <Stack gap="lg">
      <PageHeader title={t(visibility ? 'Visibility and contests' : 'Domain Settings')}>
        <Button component={Link} to="domain_dashboard" variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
      </PageHeader>
      <SettingsForm
        settings={settings}
        current={current}
        payloadMode="flat"
        loading={loading}
        fieldsGrid={!visibility}
        booleanGrid={visibility}
        itemIcons={visibility ? VISIBILITY_ICONS : undefined}
        invertedBooleanKeys={visibility ? INVERTED_KEYS : undefined}
        onValuesChange={visibility ? previewChanges : undefined}
        onSubmit={handleSubmit}
        familyExtras={visibility ? {
          setting_contest_mode: (
            <Alert
              icon={<IconInfoCircle size={16} />}
              color="blue"
              variant="light"
            >
              {t('Contest mode takes priority over manual hiding. Turning it off restores your manual settings.')}
            </Alert>
          ),
          setting_navigation: (
            <Alert
              icon={<IconInfoCircle size={16} />}
              color="blue"
              variant="light"
            >
              {t('Checked entries are visible. Uncheck to preview hiding; only Save All Changes saves your changes.')}{' '}
              {t('Hiding Problems or Contests also hides its homepage list.')}{' '}
              {t('These settings apply only to this domain and do not change page permissions.')}
            </Alert>
          ),
        } : undefined}
      />
    </Stack>
  );
}

export default function DomainEditPage() {
  return <DomainSettingsPage />;
}
