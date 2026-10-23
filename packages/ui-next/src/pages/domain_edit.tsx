import { Stack } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  IconArrowLeft,
  IconAward,
  IconCode,
  IconFlame,
  IconHistory,
  IconHome,
  IconSchool,
  IconTrophy,
} from '@tabler/icons-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { PageHeader } from '@/components/common/page-header';
import { LongSelect } from '@/components/common/select';
import { SettingsForm } from '@/components/common/settings-form';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useI18n } from '@/hooks/use-i18n';
import { useDomainNavigationPreview } from '@/stores/domain-navigation-preview';
import { formatErrorMessage } from '@/utils/error';
import { extractLocalizedContent } from '@/utils/i18n-content';

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
const DOMAIN_FIELD_ORDER = ['name', 'avatar', 'share', 'langs', 'bulletin'];
const NO_FOCUS_CONTEST = 'none';

export function DomainSettingsPage({ visibility = false }: { visibility?: boolean }) {
  const { args } = usePageData();
  const { t, language } = useI18n();
  const current = args.current || args.domain || args.ddoc || {};
  const domainId = String(current._id || args.UiContext?.domainId || '');
  const previewOwner = useRef(Symbol('domain-navigation-preview'));
  const [focusContest, setFocusContest] = useState(() => String(current.contestFocus || ''));
  const settings = useMemo(() => {
    if (!Array.isArray(args.settings)) return args.settings || {};
    if (visibility) {
      return args.settings.filter((setting) => setting.key !== 'contestFocus').map((setting) => (VISIBILITY_LABELS[setting.key]
        ? { ...setting, name: VISIBILITY_LABELS[setting.key] }
        : setting));
    }
    const modified = args.settings.map((setting) => {
      if (setting.key === 'avatar') {
        return { ...setting, name: 'Domain icon', desc: '' };
      }
      if (setting.key === 'langs') {
        return { ...setting, desc: '' };
      }
      return setting;
    });

    return modified.slice().sort((a, b) => {
      const ia = DOMAIN_FIELD_ORDER.indexOf(a.key);
      const ib = DOMAIN_FIELD_ORDER.indexOf(b.key);
      if (ia !== -1 && ib !== -1) return ia - ib;
      if (ia !== -1) return -1;
      if (ib !== -1) return 1;
      return 0;
    });
  }, [args.settings, visibility]);
  const [loading, setLoading] = useState(false);

  const previewChanges = useCallback((values: Record<string, any>) => {
    if (!visibility || !domainId) return;
    useDomainNavigationPreview.getState().setPreview({
      owner: previewOwner.current,
      domainId,
      contestMode: values.contestMode === true,
      contestFocus: focusContest,
      navigationHidden: Object.fromEntries(INVERTED_KEYS.map((key) => [key.slice('navigationHidden.'.length), values[key] === true])),
    });
  }, [visibility, domainId, focusContest]);

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
        body: JSON.stringify(visibility ? { ...payload, contestFocus: focusContest } : payload),
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
          setting_contest_mode: {
            right: (
              <LongSelect
                label={t('Focus contest')}
                description={t(
                  'Optional. Focus top bar contest, records and ranking links on one contest. Leave empty for domain-wide links.',
                )}
                data={[
                  { value: NO_FOCUS_CONTEST, label: t('No focus') },
                  ...(args.focusContests || []).map((tdoc: any) => ({
                    value: String(tdoc.docId),
                    label: `${extractLocalizedContent(tdoc.title, language)} · ${tdoc.docId}`,
                  })),
                ]}
                searchable
                clearable
                value={focusContest || NO_FOCUS_CONTEST}
                onChange={(value) => setFocusContest(value === NO_FOCUS_CONTEST ? '' : value || '')}
                disabled={loading}
              />
            ),
          },
        } : undefined}
      />
    </Stack>
  );
}

export default function DomainEditPage() {
  return <DomainSettingsPage />;
}
