import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Group, Modal, Pagination, Stack, Text, Title } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { TimeDisplay } from '@/components/common/time-display';
import { Link } from '@/components/link';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

interface DomainItem {
  _id: string;
  name?: string;
  owner?: number;
}

interface AdditionalFileItem {
  _id: string;
  domainId: string;
  docId: number;
  title?: string;
  file: {
    name: string;
    size?: number;
    lastModified?: string;
  };
}

function formatSize(size?: number) {
  if (!Number.isFinite(size)) return '-';
  if (size! < 1024) return `${size} B`;
  if (size! < 1024 * 1024) return `${(size! / 1024).toFixed(1)} KB`;
  return `${(size! / 1024 / 1024).toFixed(1)} MB`;
}

function SectionPaginator({ page, totalPages, param }: { page: number, totalPages: number, param: string }) {
  const navigate = useNavigate();
  const { t } = useI18n();
  if (totalPages <= 1) return null;
  return (
    <Group justify="center" mt="lg">
      <Pagination
        value={page}
        total={totalPages}
        onChange={(nextPage) => {
          const url = new URL(window.location.href);
          url.searchParams.set(param, String(nextPage));
          navigate(url.pathname + url.search);
        }}
        size="sm"
      />
      <Text size="xs" c="dimmed">
        {t('Page {0} of {1}').replace('{0}', String(page)).replace('{1}', String(totalPages))}
      </Text>
    </Group>
  );
}

export default function ManageSystemDataPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const domains: DomainItem[] = args.ddocs || [];
  const files: AdditionalFileItem[] = (args.fdocs || []).map((item: any) => ({
    ...item,
    _id: `${item.domainId}/${item.docId}/${item.file?.name}`,
  }));
  const domainOwners = args.domainOwners || {};
  const [pending, setPending] = useState<{ type: 'domain' | 'file', item: any } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const submitDelete = async () => {
    if (!pending) return;
    setLoading(true);
    setError('');
    setSuccess('');
    const body = pending.type === 'domain'
      ? { operation: 'delete_domain', targetDomainId: pending.item._id }
      : {
        operation: 'delete_additional_file',
        fileDomainId: pending.item.domainId,
        docId: pending.item.docId,
        filename: pending.item.file.name,
      };
    try {
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Delete failed')));
      else {
        setSuccess(t('Deleted'));
        setPending(null);
        window.location.reload();
      }
    } catch (err: any) {
      setError(err?.message || t('Network error'));
    } finally {
      setLoading(false);
    }
  };

  const domainColumns = [
    {
      key: '_id',
      title: t('Domain ID'),
      width: 180,
      render: (domain: DomainItem) => <Text size="sm" fw={700} ff="monospace">{domain._id}</Text>,
    },
    {
      key: 'name',
      title: t('Name'),
      render: (domain: DomainItem) => <Text size="sm">{domain.name || '-'}</Text>,
    },
    {
      key: 'owner',
      title: t('Owner'),
      width: 160,
      render: (domain: DomainItem) => {
        const owner = domain.owner ? domainOwners[domain.owner] : null;
        return owner ? <UserLink user={owner} size="sm" /> : <Text size="sm" c="dimmed">{domain.owner || '-'}</Text>;
      },
    },
    {
      key: 'action',
      title: t('Actions'),
      width: 120,
      align: 'right' as const,
      render: (domain: DomainItem) => (
        <Button
          size="compact-xs"
          variant="subtle"
          color="red"
          leftSection={<IconTrash size={14} />}
          disabled={domain._id === 'system'}
          onClick={() => setPending({ type: 'domain', item: domain })}
        >
          {t('Delete')}
        </Button>
      ),
    },
  ];

  const fileColumns = [
    {
      key: 'domainId',
      title: t('Domain ID'),
      width: 140,
      render: (item: AdditionalFileItem) => <Text size="xs" ff="monospace">{item.domainId}</Text>,
    },
    {
      key: 'problem',
      title: t('Problem'),
      render: (item: AdditionalFileItem) => (
        <Link to="problem_detail" params={{ domainId: item.domainId, pid: item.docId }} className="hydro-subtle-link">
          <Text size="sm" fw={600}>{item.docId}. {item.title || '-'}</Text>
        </Link>
      ),
    },
    {
      key: 'file',
      title: t('File'),
      render: (item: AdditionalFileItem) => <Text size="sm">{item.file?.name || '-'}</Text>,
    },
    {
      key: 'size',
      title: t('Size'),
      width: 100,
      align: 'right' as const,
      render: (item: AdditionalFileItem) => <Text size="xs" c="dimmed">{formatSize(item.file?.size)}</Text>,
    },
    {
      key: 'lastModified',
      title: t('Last Modified'),
      width: 140,
      render: (item: AdditionalFileItem) => (item.file?.lastModified ? <TimeDisplay date={item.file.lastModified} /> : <Text size="xs" c="dimmed">-</Text>),
    },
    {
      key: 'action',
      title: t('Actions'),
      width: 120,
      align: 'right' as const,
      render: (item: AdditionalFileItem) => (
        <Button
          size="compact-xs"
          variant="subtle"
          color="red"
          leftSection={<IconTrash size={14} />}
          onClick={() => setPending({ type: 'file', item })}
        >
          {t('Delete')}
        </Button>
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('System Data')} />
      {success && <Text c="green" size="sm">{success}</Text>}

      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" mb="md">
          <Title order={3} size="h4">{t('All Domains')}</Title>
          <Badge variant="light">{t('Total')}: {args.domainsCount || 0}</Badge>
        </Group>
        <DataTable columns={domainColumns} data={domains} emptyMessage={t('No domains')} />
        <SectionPaginator page={args.domainsPage || 1} totalPages={args.domainsPageCount || 1} param="domainsPage" />
      </Card>

      <Card withBorder p="lg" className="hydro-content-card">
        <Group justify="space-between" mb="md">
          <Title order={3} size="h4">{t('All Additional Files')}</Title>
          <Badge variant="light">{t('Total')}: {args.filesCount || 0}</Badge>
        </Group>
        <DataTable columns={fileColumns} data={files} emptyMessage={t('No additional files')} />
        <SectionPaginator page={args.filesPage || 1} totalPages={args.filesPageCount || 1} param="filesPage" />
      </Card>

      <Modal
        opened={!!pending}
        title={pending?.type === 'domain' ? t('Delete Domain') : t('Delete Additional File')}
        onClose={() => setPending(null)}
      >
        <Stack gap="md">
          <Text size="sm">
            {pending?.type === 'domain'
              ? t('Delete domain confirmation')
              : t('Delete additional file confirmation')}
          </Text>
          {pending?.type === 'domain' && <Text size="sm" fw={700}>{pending.item._id}</Text>}
          {pending?.type === 'file' && <Text size="sm" fw={700}>{pending.item.domainId} / {pending.item.docId} / {pending.item.file.name}</Text>}
          {error && <Text c="red" size="sm">{error}</Text>}
          <Group justify="flex-end">
            <Button variant="default" size="xs" onClick={() => setPending(null)}>{t('Cancel')}</Button>
            <Button color="red" size="xs" onClick={submitDelete} loading={loading}>{t('Delete')}</Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  );
}
