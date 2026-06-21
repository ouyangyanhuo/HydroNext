import { Badge, Button, Stack, Text } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { UserLink } from '@/components/user/user-link';
import { usePageData } from '@/context/page-data';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useSessionStore } from '@/stores/session';

export default function RecordMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const user = useCurrentUser();
  const domainId = useSessionStore((s) => s.ui.domainId);
  const canViewCodeReplay = useHasPriv(PRIV.PRIV_READ_RECORD_CODE);

  const rdocs = args.rdocs || [];
  const pdict = args.pdict || {};
  const udict = args.udict || {};
  const page = args.page || 1;

  const columns = [
    {
      key: '_id',
      title: '#',
      width: 80,
      render: (r: any) => (
        <Link to="record_detail" params={{ rid: r._id }} className="no-underline">
          <Text size="xs" c="dimmed" ff="monospace">
            {String(r._id).slice(-6)}
          </Text>
        </Link>
      ),
    },
    {
      key: 'status',
      title: t('Status'),
      width: 140,
      render: (r: any) => <RecordStatusBadge status={r.status} size="xs" />,
    },
    {
      key: 'uid',
      title: t('User'),
      width: 120,
      render: (r: any) => {
        const udoc = udict[r.uid];
        return udoc ? <UserLink user={udoc} size="xs" /> : <Text size="xs" c="dimmed">{r.uid}</Text>;
      },
    },
    {
      key: 'pid',
      title: t('Problem'),
      render: (r: any) => {
        const pdoc = pdict[r.pid] || pdict[`${domainId}/${r.pid}`];
        return pdoc ? (
          <Link
            to="problem_detail"
            params={{ pid: pdoc.pid || pdoc.docId }}
            className="hydro-subtle-link"
          >
            <Text size="sm" fw={600}>{pdoc.pid}. {pdoc.title}</Text>
          </Link>
        ) : (
          <Text size="sm" c="dimmed">{r.pid}</Text>
        );
      },
    },
    {
      key: 'lang',
      title: t('Language'),
      width: 100,
      render: (r: any) => (
        <Text size="xs" c="dimmed">{r.lang || '-'}</Text>
      ),
    },
    {
      key: 'time',
      title: t('Time'),
      width: 80,
      align: 'center' as const,
      render: (r: any) => (
        <Text size="xs" c="dimmed">
          {r.time != null ? `${r.time}ms` : '-'}
        </Text>
      ),
    },
    {
      key: 'memory',
      title: t('Memory'),
      width: 80,
      align: 'center' as const,
      render: (r: any) => (
        <Text size="xs" c="dimmed">
          {r.memory != null ? `${Math.round(r.memory / 1024)}MB` : '-'}
        </Text>
      ),
    },
    {
      key: 'score',
      title: t('Score'),
      width: 60,
      align: 'center' as const,
      render: (r: any) => (
        r.score != null ? (
          <Badge size="xs" variant="light" color={r.score === 100 ? 'green' : 'yellow'}>
            {r.score}
          </Badge>
        ) : (
          <Text size="xs" c="dimmed">-</Text>
        )
      ),
    },
    {
      key: 'actions',
      title: t('Actions'),
      width: 120,
      align: 'right' as const,
      render: (r: any) => (
        canViewCodeReplay || r.uid === user._id ? (
          <Button
            component={Link}
            href={buildUrl('code_replay', { rid: r._id })}
            size="compact-xs"
            variant="light"
            leftSection={<IconPlayerPlay size={14} />}
          >
            {t('Code Replay')}
          </Button>
        ) : null
      ),
    },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={t('Records')} />

      <DataTable columns={columns} data={rdocs} emptyMessage={t('No records found')} />

      <Paginator page={page} totalPages={Math.ceil((args.rdocs?.length || 0) / 50) || 1} />
    </Stack>
  );
}
