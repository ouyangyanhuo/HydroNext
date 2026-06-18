import { Button, Group, Stack, Text, TextInput } from '@mantine/core';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

function ProblemStatusCell({ psdoc }: { psdoc?: any }) {
  if (!psdoc || psdoc.status === undefined) {
    return <Text c="dimmed" size="xs">-</Text>;
  }
  return <RecordStatusBadge status={psdoc.status} size="xs" />;
}

export default function ProblemMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();

  const pdocs = args.pdocs || [];
  const psdict = args.psdict || {};
  const page = args.page || 1;
  const pcount = args.pcount || 1;
  const qs = args.qs || '';

  const [search, setSearch] = useState(qs);

  const handleSearch = () => {
    const url = new URL(window.location.href);
    if (search) {
      url.searchParams.set('q', search);
    } else {
      url.searchParams.delete('q');
    }
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const columns = [
    {
      key: 'status',
      title: '',
      width: 40,
      render: (p: any) => <ProblemStatusCell psdoc={psdict[p.docId]} />,
    },
    {
      key: 'pid',
      title: '#',
      width: 80,
      render: (p: any) => (
        <Text size="sm" fw={500}>{p.pid || p.docId}</Text>
      ),
    },
    {
      key: 'title',
      title: t('Title'),
      render: (p: any) => {
        const lang = useSessionStore.getState().language;
        return (
          <Link
            to="problem_detail"
            params={{ pid: p.pid || p.docId }}
            className="hydro-subtle-link"
          >
            <Text size="sm" fw={600}>{extractLocalizedContent(p.title, lang)}</Text>
          </Link>
        );
      },
    },
    {
      key: 'nSubmit',
      title: t('Submissions'),
      width: 100,
      align: 'center' as const,
      render: (p: any) => (
        <Text size="xs" c="dimmed">{p.nSubmit || 0}</Text>
      ),
    },
    {
      key: 'nAccept',
      title: t('Accepted'),
      width: 100,
      align: 'center' as const,
      render: (p: any) => (
        <Text size="xs" c="dimmed">{p.nAccept || 0}</Text>
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('Problems')}>
        <Group gap="xs" wrap="wrap">
          <TextInput
            placeholder={t('Search problems...')}
            value={search}
            onChange={(e) => setSearch(e.currentTarget.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            size="xs"
            className="w-[190px] sm:w-[260px]"
          />
          <Button size="xs" onClick={handleSearch}>{t('Search')}</Button>
        </Group>
      </PageHeader>

      <DataTable columns={columns} data={pdocs} emptyMessage={t('No problems found')} />

      <Paginator page={page} totalPages={pcount} />
    </Stack>
  );
}
