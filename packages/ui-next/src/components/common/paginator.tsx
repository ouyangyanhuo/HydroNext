import {
  Group, Pagination, Select, Text,
} from '@mantine/core';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { buildPaginationUrl } from '@/utils/pagination';

interface PaginatorProps {
  page: number;
  totalPages: number;
  baseUrl?: string;
  pageSize?: number;
  pageSizes?: readonly number[];
}

export function Paginator({
  page,
  totalPages,
  baseUrl,
  pageSize,
  pageSizes,
}: PaginatorProps) {
  const navigate = useNavigate();
  const { t } = useI18n();
  const pageSizeOptions = pageSizes?.map((size) => ({ value: String(size), label: String(size) })) || [];
  const showPageSize = Boolean(pageSize && pageSizeOptions.length);

  if (totalPages <= 1 && !showPageSize) return null;

  const handleChange = (p: number) => {
    navigate(buildPaginationUrl(baseUrl || window.location.href, { page: p }, window.location.origin));
  };

  const handlePageSizeChange = (value: string | null) => {
    if (!value) return;
    navigate(buildPaginationUrl(
      baseUrl || window.location.href,
      { page: 1, pageSize: Number(value) },
      window.location.origin,
    ));
  };

  return (
    <Group justify={showPageSize ? 'space-between' : 'center'} mt="lg" className="hydro-paginator" wrap="wrap">
      {showPageSize && (
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">{t('Rows per page')}</Text>
          <Select
            value={String(pageSize)}
            data={pageSizeOptions}
            onChange={handlePageSizeChange}
            allowDeselect={false}
            size="xs"
            w={76}
          />
        </Group>
      )}
      <Group gap="xs" wrap="nowrap">
        {totalPages > 1 && (
          <Pagination
            value={page}
            total={totalPages}
            onChange={handleChange}
            size="sm"
          />
        )}
        <Text size="xs" c="dimmed">
          {t('Page {0} of {1}').replace('{0}', String(page)).replace('{1}', String(totalPages))}
        </Text>
      </Group>
    </Group>
  );
}
