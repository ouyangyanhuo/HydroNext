import { Loader } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useEffect, useMemo, useState } from 'react';
import { ShortSelect } from '@/components/common/select';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import type { RecordFilterOption } from '@/utils/record-filter-options';

interface RecordFilterSelectProps {
  label: string;
  value: string;
  options: RecordFilterOption[];
  onChange: (value: string) => void;
  loadOptions: (query: string, signal: AbortSignal) => Promise<RecordFilterOption[]>;
}

/** Search behavior for record filters; appearance and keyboard navigation stay in ShortSelect. */
export function RecordFilterSelect({ label, value, options, onChange, loadOptions }: RecordFilterSelectProps) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<RecordFilterOption[]>([]);
  const [picked, setPicked] = useState<RecordFilterOption | null>(null);
  const [loading, setLoading] = useState(false);
  const selected = options.find((option) => option.value === value)
    || (picked?.value === value ? picked : null)
    || results.find((option) => option.value === value)
    || (value ? { value, label: value } : null);

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
          notifications.show({ color: 'red', title: t('Failed'), message: formatErrorMessage(error, t('Failed'), t) });
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
    if (!value || options.some((option) => option.value === value) || picked?.value === value) return undefined;
    const controller = new AbortController();
    let disposed = false;
    void loadOptions(value, controller.signal).then((items) => {
      const match = items.find((option) => option.value === value);
      if (!disposed && match) setPicked(match);
    }).catch(() => undefined);
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [loadOptions, options, picked?.value, value]);

  const matches = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const matching = options.filter((option) => !needle
      || option.label.toLocaleLowerCase().includes(needle) || option.value.toLocaleLowerCase().includes(needle));
    return [...new Map([...results, ...matching].map((option) => [option.value, option])).values()].slice(0, 20);
  }, [options, query, results]);
  const visibleValues = new Set(matches.map((option) => option.value));
  const data = selected && !visibleValues.has(selected.value) ? [selected, ...matches] : matches;

  return (
    <div onKeyDown={(event) => { if (opened && event.key === 'Enter') event.preventDefault(); }}>
      <ShortSelect
        w="100%"
        size="sm"
        label={label}
        data={data}
        value={value || null}
        onChange={(next) => {
          setPicked(data.find((option) => option.value === next) || null);
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
          setLoading(true);
        }}
        onDropdownClose={() => {
          setOpened(false); setQuery('');
          setLoading(false);
        }}
        onSearchChange={(text) => {
          setQuery(text); setResults([]);
          if (opened) setLoading(true);
        }}
        nothingFoundMessage={loading ? t('Loading...') : t('No results')}
        rightSection={loading && opened ? <Loader size={14} /> : undefined}
        filter={({ options: entries }) => entries.filter((entry) => 'value' in entry && visibleValues.has(entry.value))}
      />
    </div>
  );
}
