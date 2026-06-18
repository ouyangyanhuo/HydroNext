import { Group, Pagination, Text } from '@mantine/core';
import { useNavigate } from '@/context/router';

interface PaginatorProps {
  page: number;
  totalPages: number;
  baseUrl?: string;
}

export function Paginator({ page, totalPages, baseUrl }: PaginatorProps) {
  const navigate = useNavigate();

  if (totalPages <= 1) return null;

  const handleChange = (p: number) => {
    if (baseUrl) {
      const url = new URL(baseUrl, window.location.origin);
      url.searchParams.set('page', String(p));
      navigate(url.pathname + url.search);
    } else {
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(p));
      navigate(url.pathname + url.search);
    }
  };

  return (
    <Group justify="center" mt="lg" className="hydro-paginator">
      <Pagination
        value={page}
        total={totalPages}
        onChange={handleChange}
        size="sm"
      />
      <Text size="xs" c="dimmed">
        Page {page} of {totalPages}
      </Text>
    </Group>
  );
}
