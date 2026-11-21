import { ScrollArea, Table } from '@mantine/core';
import type { KeyboardEvent, MouseEvent } from 'react';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
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
  emptyDescription?: React.ReactNode;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;
  striped?: boolean;
  highlightOnHover?: boolean;
  stickyFirstColumn?: boolean;
  onRowClick?: (item: T) => void;
  rowLabel?: (item: T) => string;
}

function DataTableComponent<T extends Record<string, any>>({
  columns,
  data,
  keyField = '_id',
  emptyMessage,
  emptyDescription,
  emptyIcon,
  emptyAction,
  striped = true,
  highlightOnHover = true,
  stickyFirstColumn = false,
  onRowClick,
  rowLabel,
}: DataTableProps<T>) {
  const { t } = useI18n();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const updateScrollEdges = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollWidth - el.clientWidth - el.scrollLeft > 2;
    setScrollEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }));
  }, []);

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return undefined;
    updateScrollEdges();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(updateScrollEdges);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, [columns.length, data.length, updateScrollEdges]);

  if (!data || data.length === 0) {
    return (
      <EmptyState
        message={emptyMessage ?? t('No data')}
        description={emptyDescription}
        icon={emptyIcon}
        action={emptyAction}
      />
    );
  }

  return (
    <div
      className="hydro-table-wrap"
      data-scroll-left={scrollEdges.left ? 'true' : undefined}
      data-scroll-right={scrollEdges.right ? 'true' : undefined}
    >
      <ScrollArea
        type="auto"
        scrollbarSize={8}
        viewportRef={viewportRef}
        onScrollPositionChange={updateScrollEdges}
      >
        <Table
          striped={striped}
          highlightOnHover={highlightOnHover}
          verticalSpacing="sm"
          horizontalSpacing="md"
          className={stickyFirstColumn ? 'hydro-data-table hydro-data-table--sticky-first' : 'hydro-data-table'}
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
