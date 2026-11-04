import { Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useState } from 'react';
import { ShortSelect } from '@/components/common/select';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import type { RecordFilterOption } from '@/utils/record-filter-options';

interface RecordFilterSelectProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  loadOptions: (query: string, signal: AbortSignal, exact?: boolean) => Promise<RecordFilterOption[]>;
}

/** Search behavior for record filters; appearance and keyboard navigation stay in ShortSelect. */
export function RecordFilterSelect({ label, value, onChange, loadOptions }: RecordFilterSelectProps) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecordFilterOption[]>([]);
  const [picked, setPicked] = useState<{ requestedValue: string, option: RecordFilterOption } | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState('');
  const selected = (picked?.requestedValue === value ? picked.option : null)
    || results.find((option) => option.value === value) || null;

  useEffect(() => {
    if (!opened) return undefined;
    const controller = new AbortController();
    let disposed = false;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setResults([]);
      void loadOptions(query, controller.signal).then((items) => {
        if (!disposed) setResults(items);
      }).catch((error) => {
        if (!disposed && !controller.signal.aborted) {
          const message = formatErrorMessage(error, t('Failed'), t);
          setSearchError(message);
          notifications.show({ color: 'red', title: t('Failed'), message });
        }
      }).finally(() => { if (!disposed) setLoading(false); });
    }, 250);
    return () => {
      disposed = true;
      window.clearTimeout(timer); controller.abort();
    };
  }, [loadOptions, opened, query, t]);

  // Resolve labels for deep links even when the selected user/problem has no records on this page.
  useEffect(() => {
    if (!value || picked?.requestedValue === value) return undefined;
    const controller = new AbortController();
    let disposed = false;
    void loadOptions(value, controller.signal, true).then((items) => {
      const match = items.find((option) => option.value === value) || (items.length === 1 ? items[0] : null);
      if (!disposed && match) setPicked({ requestedValue: value, option: match });
    }).catch(() => undefined);
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [loadOptions, picked?.requestedValue, value]);

  // Only the permission-checked endpoint can supply options, never record dictionaries or raw URL values.
  const matches = results;
  const visibleValues = new Set(matches.map((option) => option.value));
  const data = selected && !visibleValues.has(selected.value) ? [selected, ...matches] : matches;

  return (
    <div onKeyDown={(event) => { if (opened && event.key === 'Enter') event.preventDefault(); }}>
      <ShortSelect
        w="100%"
        size="sm"
        label={label}
        data={data}
        value={selected?.value || null}
        onChange={(next) => {
          const option = data.find((item) => item.value === next);
          setPicked(option ? { requestedValue: option.value, option } : null);
          onChange(next || '');
        }}
        searchable
        clearable
        clearButtonProps={{ 'aria-label': `${t('Reset')} ${label}` }}
        allowDeselect={false}
        autoComplete="off"
        maxDropdownHeight={260}
        onDropdownOpen={() => {
          setQuery((text) => text === selected?.label || text === value ? '' : text);
          setOpened(true);
          setResults([]);
          setSearchError('');
          setLoading(true);
        }}
        onDropdownClose={() => {
          setOpened(false); setQuery('');
          setLoading(false);
        }}
        onSearchChange={(text) => {
          setQuery(text); setResults([]);
          setSearchError('');
          if (opened) setLoading(true);
        }}
        nothingFoundMessage={searchError || (loading ? t('Loading...') : t('No results'))}
        rightSection={loading && opened ? <Loader size={14} /> : undefined}
        filter={({ options: entries }) => entries.filter((entry) => 'value' in entry && visibleValues.has(entry.value))}
      />
    </div>
  );
}
