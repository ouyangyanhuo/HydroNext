import { ScrollArea, Table } from '@mantine/core';
import type { KeyboardEvent, MouseEvent } from 'react';
import { memo } from 'react';
import { useI18n } from '@/hooks/use-i18n';
import { siblingIndexStyle } from '@/utils/stagger';
import { EmptyState } from './empty-state';

const INTERACTIVE_SELECTOR = 'a, button, input, select, textarea, label, '
  + '[role="button"], [role="checkbox"], [role="combobox"], [contenteditable="true"]';

interface Column<T> {
  key: string;
  title: React.ReactNode;
  render?: (item: T) => React.ReactNode;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  keyField?: string;
  emptyMessage?: string;
  striped?: boolean;
  highlightOnHover?: boolean;
  onRowClick?: (item: T) => void;
  rowLabel?: (item: T) => string;
}

function DataTableComponent<T extends Record<string, any>>({
  columns,
  data,
  keyField = '_id',
  emptyMessage,
  striped = true,
  highlightOnHover = true,
  onRowClick,
  rowLabel,
}: DataTableProps<T>) {
  const { t } = useI18n();
  if (!data || data.length === 0) {
    return <EmptyState message={emptyMessage ?? t('No data')} />;
  }

  return (
    <div className="hydro-table-wrap">
      <ScrollArea type="auto" scrollbarSize={8}>
        <Table
          striped={striped}
          highlightOnHover={highlightOnHover}
          verticalSpacing="sm"
          horizontalSpacing="md"
          className="hydro-data-table"
        >
          <Table.Thead>
            <Table.Tr>
              {columns.map((col) => (
                <Table.Th key={col.key} style={{ width: col.width, textAlign: col.align }}>
                  {col.title}
                </Table.Th>
              ))}
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data.map((item, index) => {
              const handleRowClick = onRowClick
                ? (event: MouseEvent<HTMLTableRowElement>) => {
                  if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
                  onRowClick(item);
                }
                : undefined;

              const handleRowKeyDown = onRowClick
                ? (event: KeyboardEvent<HTMLTableRowElement>) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    if ((event.target as HTMLElement).closest(INTERACTIVE_SELECTOR)) return;
                    event.preventDefault();
                    onRowClick(item);
                  }
                }
                : undefined;

              return (
                <Table.Tr
                  key={item[keyField]}
                  className={onRowClick ? 'hydro-data-table__clickable-row' : undefined}
                  style={siblingIndexStyle(index)}
                  tabIndex={onRowClick ? 0 : undefined}
                  aria-label={onRowClick ? rowLabel?.(item) : undefined}
                  onClick={handleRowClick}
                  onKeyDown={handleRowKeyDown}
                >
                  {columns.map((col) => (
                    <Table.Td key={col.key} style={{ textAlign: col.align }}>
                      {col.render ? col.render(item) : item[col.key]}
                    </Table.Td>
                  ))}
                </Table.Tr>
              );
            })}
          </Table.Tbody>
        </Table>
      </ScrollArea>
    </div>
  );
}

export const DataTable = memo(DataTableComponent) as typeof DataTableComponent;
