import { Loader, Text } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { FormDialog } from '@/components/common/form-dialog';
import { LongSelect, TagMultiSelect } from '@/components/common/select';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { requestHonorFrame } from '@/utils/honor-frame-api';

interface Option { value: string, label: string, disabled?: boolean }
function useFrameSearch(kind: 'frames' | 'users', opened: boolean, selected: string[]) {
  const [search, setSearch] = useState('');
  const [options, setOptions] = useState<Option[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const buildUrl = useBuildUrl();
  const url = buildUrl('manage_honor_frame_search', {}, { q: search, kind });
  const selectedKey = selected.join(',');
  useEffect(() => {
    if (!opened) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError('');
      void requestHonorFrame(url, { signal: controller.signal }).then((data) => {
        if (controller.signal.aborted) return;
        setOptions((old) => [...new Map([
          ...old.filter((option) => selectedKey.split(',').includes(option.value)), ...data.options,
        ].map((option) => [option.value, option])).values()]);
      }).catch((err) => { if (!controller.signal.aborted) setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [opened, url, selectedKey]);
  return { options, search, setSearch, loading, error };
}

export function HonorFrameGrantDialog({ opened, onClose, busy, onGrant }: {
  opened: boolean; onClose: () => void; busy: boolean; onGrant: (id: string, uids: number[]) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [id, setId] = useState<string | null>(null);
  const [uids, setUids] = useState<string[]>([]);
  const frameIds = useMemo(() => id ? [id] : [], [id]);
  const frames = useFrameSearch('frames', opened, frameIds);
  const users = useFrameSearch('users', opened, uids);
  return <FormDialog
    opened={opened}
    onClose={onClose}
    title={t('Grant frame')}
    fields={[]}
    loading={busy}
    confirmLabel={t('Grant frame')}
    onSubmit={async () => {
      if (!id || !uids.length) throw new Error(t('Select a frame and at least one user.'));
      if (await onGrant(id, uids.map(Number))) {
        setId(null);
        setUids([]);
        onClose();
      }
    }}>
    <LongSelect
      label={t('Honor avatar frame')}
      data={frames.options.map((option) => option.disabled
        ? { ...option, label: `${option.label} (${t('Disabled')})` } : option)}
      value={id}
      onChange={setId}
      searchValue={frames.search}
      onSearchChange={frames.setSearch}
      filter={({ options }) => options}
      rightSection={frames.loading ? <Loader size={14} /> : undefined}
      error={frames.error ? t(frames.error) : undefined}
      nothingFoundMessage={t('No honor frames found.')}
      disabled={busy}
      required />
    <TagMultiSelect
      label={t('Recipients')}
      description={t('Search by username or user ID. Up to 50 users at a time.')}
      data={users.options}
      value={uids}
      onChange={setUids}
      searchValue={users.search}
      onSearchChange={users.setSearch}
      filter={({ options }) => options}
      maxValues={50}
      disabled={busy}
      required
      error={users.error ? t(users.error) : undefined}
      rightSection={users.loading ? <Loader size={14} /> : undefined}
      nothingFoundMessage={t('No users found')} />
    <Text size="xs" c="dimmed">{t('Only published frames can be awarded. Awards are global across all domains.')}</Text>
  </FormDialog>;
}
