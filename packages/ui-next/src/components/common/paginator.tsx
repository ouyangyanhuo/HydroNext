import { Group, Pagination, Text, TextInput } from '@mantine/core';
import { IconCornerDownLeft } from '@tabler/icons-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { buildPaginationUrl } from '@/utils/pagination';
import { ActionIcon } from './button';
import { ShortSelect } from './select';

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
  const [jumpInput, setJumpInput] = useState('');
  const pageSizeOptions = pageSizes?.map((size) => ({ value: String(size), label: String(size) })) || [];
  const showPageSize = Boolean(pageSize && pageSizeOptions.length);
  const showQuickJump = totalPages > 5;

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

  const handleJumpSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = Number.parseInt(jumpInput.trim(), 10);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(1, Math.min(totalPages, parsed));
    setJumpInput('');
    if (clamped !== page) {
      handleChange(clamped);
    }
  };

  return (
    <Group justify={showPageSize ? 'space-between' : 'center'} mt="lg" className="hydro-paginator" wrap="wrap" gap="sm">
      {showPageSize && (
        <Group gap="xs" wrap="nowrap">
          <Text size="xs" c="dimmed">{t('Rows per page')}</Text>
          <ShortSelect
            aria-label={t('Rows per page')}
            value={String(pageSize)}
            data={pageSizeOptions}
            onChange={handlePageSizeChange}
            allowDeselect={false}
            size="xs"
            width={76}
            height={30}
            styles={{
              input: { fontSize: 'var(--mantine-font-size-xs)', fontWeight: 'var(--hydro-weight-regular)' },
              option: { fontSize: 'var(--mantine-font-size-xs)' },
            }}
          />
        </Group>
      )}
      <Group gap="xs" wrap="wrap" justify="center">
        {totalPages > 1 && (
          <Pagination
            value={page}
            total={totalPages}
            onChange={handleChange}
            size="sm"
          />
        )}
        <Text size="xs" c="dimmed" className="hydro-numeric whitespace-nowrap">
          {t('Page {0} of {1}').replace('{0}', String(page)).replace('{1}', String(totalPages))}
        </Text>
        {showQuickJump && (
          <form onSubmit={handleJumpSubmit} className="hydro-paginator__jump">
            <TextInput
              size="xs"
              w={74}
              inputMode="numeric"
              pattern="[0-9]*"
              value={jumpInput}
              onChange={(event) => setJumpInput(event.currentTarget.value.replace(/\D/g, ''))}
              placeholder={t('Jump')}
              aria-label={t('Go to page')}
              classNames={{ input: 'hydro-paginator__jump-input hydro-numeric' }}
              rightSection={(
                <ActionIcon
                  type="submit"
                  size="xs"
                  variant="subtle"
                  color="gray"
                  aria-label={t('Go to page')}
                  disabled={!jumpInput}
                >
                  <IconCornerDownLeft size={12} stroke={1.9} />
                </ActionIcon>
              )}
              rightSectionPointerEvents="auto"
            />
          </form>
        )}
      </Group>
    </Group>
  );
}
