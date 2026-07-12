import { Badge, Button, Group, Select, Stack, Text, TextInput, Title } from '@mantine/core';
import { IconFilter, IconPlayerPlay, IconRefresh } from '@tabler/icons-react';
import { useCallback, useMemo, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { Paginator } from '@/components/common/paginator';
import { Link } from '@/components/link';
import { RecordStatusBadge } from '@/components/record/record-status-badge';
import { STATUS_TEXTS } from '@/components/record/status-map';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useI18n } from '@/hooks/use-i18n';
import { PRIV, useHasPriv } from '@/hooks/use-permission';
import { useWebSocket } from '@/hooks/use-websocket';
import { useSessionStore } from '@/stores/session';

const ALL_FILTER = '__all__';

export function formatScore(score: unknown): string {
  const value = Number(score);
  if (!Number.isFinite(value)) return '-';
  return Number.isInteger(value) ? String(value) : String(Math.round(value * 100) / 100);
}

export function mergeLiveRecord(
  current: any[],
  record: any,
  options: { matches: boolean, page: number, allowPush: boolean, limit: number },
): any[] {
  const rid = String(record._id);
  const index = current.findIndex((item) => String(item._id) === rid);
  if (!options.matches) {
    return index < 0 ? current : current.filter((_, currentIndex) => currentIndex !== index);
  }
  if (index >= 0) {
    const next = [...current];
    next[index] = { ...next[index], ...record };
    return next;
  }
  if (options.page !== 1 || !options.allowPush) return current;
  return [record, ...current].slice(0, options.limit);
}

export default function RecordMainPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const navigate = useNavigate();
  const user = useCurrentUser();
  const domainId = useSessionStore((s) => s.ui.domainId);
  const canViewCodeReplay = useHasPriv(PRIV.PRIV_READ_RECORD_CODE);

  const initialRdocs = useMemo(() => args.rdocs || [], [args.rdocs]);
  const initialPdict = useMemo(() => args.pdict || {}, [args.pdict]);
  const initialUdict = useMemo(() => args.udict || {}, [args.udict]);
  const [rdocs, setRdocs] = useState<any[]>(initialRdocs);
  const [pdict, setPdict] = useState<Record<string, any>>(initialPdict);
  const [udict, setUdict] = useState<Record<string, any>>(initialUdict);
  const page = args.page || 1;
  const totalPages = args.tpcount || Math.max(1, page + (args.hasNextPage ? 1 : 0));

  const [uidOrName, setUidOrName] = useState(String(args.filterUidOrName || ''));
  const [pid, setPid] = useState(String(args.filterPid || ''));
  const [tid, setTid] = useState(String(args.filterTid || ''));
  const [lang, setLang] = useState(args.filterLang || ALL_FILTER);
  const [status, setStatus] = useState(
    typeof args.filterStatus === 'number' ? String(args.filterStatus) : ALL_FILTER,
  );

  const languageOptions = useMemo(() => {
    const configuredLangs = args.langs || (window as any).LANGS || {};
    const languageMap = new Map<string, string>();
    Object.entries(configuredLangs).forEach(([id, info]: [string, any]) => {
      if (!info?.hidden) languageMap.set(id, info?.display || info?.name || id);
    });
    rdocs.forEach((record: any) => {
      if (record.lang && !languageMap.has(record.lang)) languageMap.set(record.lang, record.lang);
    });
    if (args.filterLang && !languageMap.has(args.filterLang)) languageMap.set(args.filterLang, args.filterLang);
    return [{ value: ALL_FILTER, label: t('All Languages') }, ...Array.from(languageMap, ([value, label]) => ({ value, label }))];
  }, [args.filterLang, args.langs, rdocs, t]);
  const languageLabels = useMemo(
    () => new Map(languageOptions.map((option) => [option.value, option.label])),
    [languageOptions],
  );
  const statusOptions = useMemo(() => [
    { value: ALL_FILTER, label: t('All Submissions') },
    ...Object.entries(STATUS_TEXTS).map(([value, label]) => ({ value, label: t(label) })),
  ], [t]);

  const socketUrl = useMemo(() => {
    const params = new URLSearchParams({ domainId, noTemplate: 'true' });
    if (args.filterTid) params.set('tid', String(args.filterTid));
    if (args.filterUidOrName) params.set('uidOrName', String(args.filterUidOrName));
    if (args.filterPid) params.set('pid', String(args.filterPid));
    if (args.filterLang) params.set('lang', String(args.filterLang));
    if (typeof args.filterStatus === 'number') params.set('status', String(args.filterStatus));
    if (args.all) params.set('all', 'true');
    if (args.allDomain) params.set('allDomain', 'true');
    return `record-conn?${params.toString()}`;
  }, [args.all, args.allDomain, args.filterLang, args.filterPid, args.filterStatus,
    args.filterTid, args.filterUidOrName, domainId]);
  const initialRids = useMemo(
    () => initialRdocs.map((record: any) => String(record._id)),
    [initialRdocs],
  );
  const handleSocketOpen = useCallback((send: (payload: any) => void) => {
    send({ rids: initialRids });
  }, [initialRids]);

  const handleSocketMessage = useCallback((payload: any) => {
    const record = payload?.rdoc;
    if (!record?._id) return;
    const matchesStatus = typeof args.filterStatus !== 'number'
      || Number(record.status) === args.filterStatus;
    const matchesLanguage = !args.filterLang || record.lang === args.filterLang;
    setRdocs((current) => {
      const limit = Number(args.limit) || current.length || 100;
      return mergeLiveRecord(current, record, {
        matches: matchesStatus && matchesLanguage,
        page,
        allowPush: !new URLSearchParams(window.location.search).has('nopush'),
        limit,
      });
    });
    if (payload.udoc?._id != null) {
      setUdict((current) => ({ ...current, [payload.udoc._id]: payload.udoc }));
    }
    if (payload.pdoc?.docId != null) {
      setPdict((current) => ({
        ...current,
        [payload.pdoc.docId]: payload.pdoc,
        [`${payload.pdoc.domainId}/${payload.pdoc.docId}`]: payload.pdoc,
      }));
    }
  }, [args.filterLang, args.filterStatus, args.limit, page]);

  useWebSocket({
    url: socketUrl,
    onOpen: handleSocketOpen,
    onMessage: handleSocketMessage,
    autoReconnect: true,
  });

  const handleFilter = () => {
    const url = new URL(window.location.href);
    const textFilters = { uidOrName, pid, tid };
    Object.entries(textFilters).forEach(([key, value]) => {
      if (value.trim()) url.searchParams.set(key, value.trim());
      else url.searchParams.delete(key);
    });
    if (lang !== ALL_FILTER) url.searchParams.set('lang', lang);
    else url.searchParams.delete('lang');
    if (status !== ALL_FILTER) url.searchParams.set('status', status);
    else url.searchParams.delete('status');
    url.searchParams.delete('page');
    navigate(url.pathname + url.search);
  };

  const handleReset = () => {
    setUidOrName('');
    setPid('');
    setTid('');
    setLang(ALL_FILTER);
    setStatus(ALL_FILTER);
    navigate(buildUrl('record_main'));
  };

  const columns = useMemo(() => [
    {
      key: '_id',
      title: '#',
      width: 80,
      render: (r: any) => <Text className="hydro-record-id">{String(r._id).slice(-6)}</Text>,
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
        return <Text size="xs" fw={600}>{udoc?.uname || udoc?.displayName || r.uid}</Text>;
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
            onClick={(event) => event.stopPropagation()}
          >
            <Text size="sm" fw={650}>{pdoc.pid}. {pdoc.title}</Text>
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
        <Text size="xs" c="dimmed" fw={600}>{languageLabels.get(r.lang) || r.lang || '-'}</Text>
      ),
    },
    {
      key: 'time',
      title: t('Time'),
      width: 80,
      align: 'center' as const,
      render: (r: any) => (
        <Text size="xs" c="dimmed" ff="monospace">
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
        <Text size="xs" c="dimmed" ff="monospace">
          {r.memory != null ? `${Math.round(r.memory / 1024)}MB` : '-'}
        </Text>
      ),
    },
    {
      key: 'score',
      title: t('Score'),
      width: 84,
      align: 'center' as const,
      render: (r: any) => (
        r.score != null ? (
          <Badge
            size="sm"
            variant="light"
            color={Number(r.score) >= 100 ? 'green' : 'yellow'}
            className="hydro-record-score"
          >
            {formatScore(r.score)}
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
            className="hydro-record-replay"
          >
            {t('Code Replay')}
          </Button>
        ) : null
      ),
    },
  ], [buildUrl, canViewCodeReplay, domainId, languageLabels, pdict, t, udict, user._id]);

  const openRecord = useCallback((record: any) => {
    navigate(buildUrl('record_detail', { rid: record._id }));
  }, [buildUrl, navigate]);

  return (
    <main className="hydro-record-page">
      <Stack gap="lg">
        <PageHeader title={t('Records')} />

        <form
          className="hydro-record-filter"
          onSubmit={(event) => {
            event.preventDefault();
            handleFilter();
          }}
        >
          <div className="hydro-record-filter__header">
            <Group gap="xs">
              <IconFilter size={18} stroke={1.8} aria-hidden="true" />
              <Title order={2} size="h5">{t('Filter')}</Title>
            </Group>
            <Group gap="xs">
              <Button type="button" size="xs" variant="subtle" onClick={handleReset} leftSection={<IconRefresh size={14} />}>
                {t('Reset')}
              </Button>
              <Button type="submit" size="xs" leftSection={<IconFilter size={14} />}>
                {t('Filter')}
              </Button>
            </Group>
          </div>

          <div className="hydro-record-filter__fields">
            <TextInput
              label={t('By Username / UID')}
              value={uidOrName}
              onChange={(event) => setUidOrName(event.currentTarget.value)}
              autoComplete="off"
            />
            <TextInput label={t('By Problem')} value={pid} onChange={(event) => setPid(event.currentTarget.value)} />
            <TextInput label={t('By Contest')} value={tid} onChange={(event) => setTid(event.currentTarget.value)} />
            <Select
              label={t('By Language')}
              data={languageOptions}
              value={lang}
              onChange={(value) => setLang(value || ALL_FILTER)}
              searchable
              classNames={{ dropdown: 'hydro-record-select-dropdown' }}
            />
            <Select
              label={t('By Status')}
              data={statusOptions}
              value={status}
              onChange={(value) => setStatus(value || ALL_FILTER)}
              searchable
              classNames={{ dropdown: 'hydro-record-select-dropdown' }}
            />
          </div>
        </form>

        <div className="hydro-record-list">
          <DataTable
            columns={columns}
            data={rdocs}
            emptyMessage={t('No records found')}
            onRowClick={openRecord}
            rowLabel={(record) => `${t('Record')} ${String(record._id).slice(-6)}`}
          />
        </div>

        <Paginator page={page} totalPages={totalPages} />
      </Stack>
    </main>
  );
}
