import { Table } from '@mantine/core';
import { EmptyState } from './empty-state';

interface Column<T> {
  key: string;
  title: string;
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
}

export function DataTable<T extends Record<string, any>>({
  columns,
  data,
  keyField = '_id',
  emptyMessage = 'No data',
  striped = true,
  highlightOnHover = true,
}: DataTableProps<T>) {
  if (!data || data.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <Table striped={striped} highlightOnHover={highlightOnHover}>
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
        {data.map((item) => (
          <Table.Tr key={item[keyField]}>
            {columns.map((col) => (
              <Table.Td key={col.key} style={{ textAlign: col.align }}>
                {col.render ? col.render(item) : item[col.key]}
              </Table.Td>
            ))}
          </Table.Tr>
        ))}
      </Table.Tbody>
    </Table>
  );
}
