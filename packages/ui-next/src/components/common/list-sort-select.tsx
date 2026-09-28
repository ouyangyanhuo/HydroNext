import { IconArrowsSort, IconChevronDown } from '@tabler/icons-react';
import { ShortSelect } from '@/components/common/select';
import { useI18n } from '@/hooks/use-i18n';
import { useListSort } from '@/hooks/use-list-sort';
import type { ListKind } from '@/utils/list-sort';

export function ListSortSelect({ kind }: { kind: ListKind }) {
  const { t } = useI18n();
  const sort = useListSort(kind);
  return (
    <ShortSelect
      {...sort}
      data={[
        { value: 'default', label: t('Default order') },
        { value: 'asc', label: t(kind === 'problem' ? 'Ascending ID' : 'Title ascending') },
        { value: 'desc', label: t(kind === 'problem' ? 'Descending ID' : 'Title descending') },
        { value: 'recent', label: t('Recently added') },
        { value: 'oldest', label: t('Oldest first') },
      ]}
      aria-label={t('Sort order')}
      title={t('Sort order')}
      allowDeselect={false}
      checkIconPosition="right"
      leftSection={<IconArrowsSort size={15} stroke={1.8} aria-hidden="true" />}
      rightSection={<IconChevronDown size={13} aria-hidden="true" />}
      size="xs"
      radius="md"
      className="hydro-list-sort"
      comboboxProps={{ withinPortal: true, zIndex: 400, shadow: 'md', offset: 6 }}
    />
  );
}
