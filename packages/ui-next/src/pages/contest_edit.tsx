import { Avatar, Badge, Button, Card, Checkbox, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useDomainId } from '@/hooks/use-domain';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import { getLangDisplay, LANG_DISPLAY } from '@/utils/lang-display';

interface SearchOption {
  value: string;
  label: string;
  description?: string;
  avatarUrl?: string;
}

const EMPTY_MARKDOWN = '<!-- empty -->';

function pad(value: number) {
  return String(value).padStart(2, '0');
}

function splitDateTime(value: any) {
  const date = value ? new Date(value) : new Date(Date.now() + 15 * 60 * 1000);
  return {
    date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function addHours(date: string, time: string, duration: number) {
  const begin = new Date(`${date}T${time || '00:00'}`);
  if (Number.isNaN(begin.getTime())) return '';
  begin.setMinutes(begin.getMinutes() + Number(duration || 0) * 60);
  return `${begin.getFullYear()}-${pad(begin.getMonth() + 1)}-${pad(begin.getDate())} ${pad(begin.getHours())}:${pad(begin.getMinutes())}`;
}

function formatSize(size?: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function languageOptions() {
  const langs = (window as any).LANGS || {};
  const entries = Object.entries<any>(langs)
    .filter(([, value]) => !value?.hidden && !value?.disabled)
    .map(([key, value]) => ({ value: key, label: value?.display || getLangDisplay(key) }));
  if (entries.length) return entries;
  return Object.entries(LANG_DISPLAY).map(([value, label]) => ({ value, label }));
}

function splitValues(value: string | string[] | number[]) {
  if (Array.isArray(value)) return value.map((item) => String(item)).filter(Boolean);
  return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
}

function mergeOptions(...groups: SearchOption[][]) {
  const seen = new Set<string>();
  const result: SearchOption[] = [];
  for (const group of groups) {
    for (const item of group) {
      if (seen.has(item.value)) continue;
      seen.add(item.value);
      result.push(item);
    }
  }
  return result;
}

async function callApi(domainId: string, op: string, args: Record<string, any>, projection: string[]) {
  const res = await fetch(`/d/${encodeURIComponent(domainId)}/api/${encodeURIComponent(op)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ args, projection }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw data.error || new Error('API request failed');
  return data;
}

function AsyncTagSelect({
  label,
  placeholder,
  className,
  value,
  data,
  loading,
  withAvatar,
  onSearch,
  onChange,
}: {
  label: string;
  placeholder: string;
  className?: string;
  value: string[];
  data: SearchOption[];
  loading: boolean;
  withAvatar?: boolean;
  onSearch: (query: string) => void;
  onChange: (value: string[]) => void;
}) {
  return (
    <MultiSelect
      className={className}
      label={label}
      placeholder={placeholder}
      data={data}
      value={value}
      searchable
      clearable
      hidePickedOptions
      nothingFoundMessage="No results"
      rightSection={loading ? <Text size="xs" c="dimmed">...</Text> : null}
      onSearchChange={onSearch}
      onChange={onChange}
      renderOption={({ option }) => {
        const item = option as SearchOption;
        return (
          <Group gap="sm" wrap="nowrap">
            {withAvatar && <Avatar src={item.avatarUrl} size={30} radius="xl" />}
            <div className="min-w-0">
              <Text size="sm" fw={600} truncate>{item.label}</Text>
              {item.description && <Text size="xs" c="dimmed" truncate>{item.description}</Text>}
            </div>
          </Group>
        );
      }}
    />
  );
}

export default function ContestEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const domainId = useDomainId();
  const tdoc = args.tdoc || {};
  const isNew = !tdoc.docId;
  const begin = splitDateTime(args.beginAt || tdoc.beginAt);
  const rules = args.rules || { acm: 'ACM/ICPC', oi: 'OI', homework: 'Homework' };
  const initialPermission = (tdoc.assign || []).length ? 'assign' : tdoc._code ? 'invite' : 'public';

  const [form, setForm] = useState({
    title: tdoc.title || '',
    content: tdoc.content || '',
    rule: tdoc.rule || Object.keys(rules)[0] || 'acm',
    beginAtDate: begin.date,
    beginAtTime: begin.time,
    duration: Number(args.duration || tdoc.duration || 2),
    pids: args.pids || (tdoc.pids || []).join(','),
    maintainer: (tdoc.maintainer || []).join(','),
    permission: initialPermission,
    assign: (tdoc.assign || []).join(','),
    code: tdoc._code || '',
    langs: (tdoc.langs || []).join(','),
    rated: tdoc.rated ?? true,
    autoHide: tdoc.autoHide ?? false,
    allowViewCode: tdoc.allowViewCode ?? true,
    allowPrint: tdoc.allowPrint ?? false,
    keepScoreboardHidden: tdoc.keepScoreboardHidden ?? false,
    lock: tdoc.lockAt && tdoc.endAt ? Math.round((new Date(tdoc.endAt).getTime() - new Date(tdoc.lockAt).getTime()) / 60000) : '',
    contestDuration: tdoc.duration || '',
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [problemOptions, setProblemOptions] = useState<SearchOption[]>(() => splitValues(args.pids || (tdoc.pids || []).join(',')).map((id) => ({ value: id, label: `ID ${id}` })));
  const [userOptions, setUserOptions] = useState<SearchOption[]>(() => splitValues((tdoc.maintainer || []).join(',')).map((id) => ({ value: id, label: `UID ${id}` })));
  const [problemSearching, setProblemSearching] = useState(false);
  const [userSearching, setUserSearching] = useState(false);
  const problemSearchSeq = useRef(0);
  const userSearchSeq = useRef(0);

  const endAt = useMemo(() => addHours(form.beginAtDate, form.beginAtTime, Number(form.duration)), [form.beginAtDate, form.beginAtTime, form.duration]);
  const showLock = ['acm', 'ioi'].includes(form.rule);
  const showFlexibleDuration = ['oi', 'ioi', 'ledo', 'strictioi'].includes(form.rule);
  const showHiddenScoreboard = ['oi', 'strictioi'].includes(form.rule);
  const files = args.files || tdoc.files || [];
  const langs = languageOptions();
  const selectedProblems = splitValues(form.pids);
  const selectedMaintainers = splitValues(form.maintainer);

  const problemData = useMemo(
    () => mergeOptions(selectedProblems.map((id) => ({ value: id, label: problemOptions.find((item) => item.value === id)?.label || `ID ${id}` })), problemOptions),
    [problemOptions, selectedProblems],
  );
  const userData = useMemo(
    () => mergeOptions(selectedMaintainers.map((id) => ({ value: id, label: userOptions.find((item) => item.value === id)?.label || `UID ${id}` })), userOptions),
    [selectedMaintainers, userOptions],
  );

  useEffect(() => {
    let disposed = false;
    const ids = splitValues(form.pids).map((id) => Number(id)).filter((id) => Number.isSafeInteger(id));
    if (!domainId || !ids.length) return undefined;
    callApi(domainId, 'problems', { ids }, ['docId', 'pid', 'title'])
      .then((pdocs: any[]) => {
        if (disposed) return;
        setProblemOptions((current) => mergeOptions(
          pdocs.map((pdoc) => ({
            value: String(pdoc.docId),
            label: `${pdoc.pid ? `${pdoc.pid} ` : ''}${pdoc.title || `ID ${pdoc.docId}`}`,
            description: `ID = ${pdoc.docId}`,
          })),
          current,
        ));
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, [domainId]);

  useEffect(() => {
    let disposed = false;
    const auto = splitValues(form.maintainer);
    if (!domainId || !auto.length) return undefined;
    callApi(domainId, 'users', { auto }, ['_id', 'uname', 'displayName', 'avatarUrl'])
      .then((udocs: any[]) => {
        if (disposed) return;
        setUserOptions((current) => mergeOptions(
          udocs.map((udoc) => ({
            value: String(udoc._id),
            label: `${udoc.uname}${udoc.displayName ? ` (${udoc.displayName})` : ''}`,
            description: `UID = ${udoc._id}`,
            avatarUrl: udoc.avatarUrl,
          })),
          current,
        ));
      })
      .catch(() => undefined);
    return () => { disposed = true; };
  }, [domainId]);

  const searchProblems = async (query: string) => {
    if (!domainId) return;
    const seq = ++problemSearchSeq.current;
    setProblemSearching(true);
    try {
      const res = await fetch(buildUrl('problem_main', { domainId }, { q: query, quick: 'true', sort: query ? 'default' : 'recent' }), { headers: { Accept: 'application/json' } });
      const data = await res.json();
      if (seq !== problemSearchSeq.current) return;
      const pdocs = Array.isArray(data.pdocs) ? data.pdocs : [];
      setProblemOptions((current) => mergeOptions(
        pdocs.map((pdoc: any) => ({
          value: String(pdoc.docId),
          label: `${pdoc.pid ? `${pdoc.pid} ` : ''}${pdoc.title || `ID ${pdoc.docId}`}`,
          description: `ID = ${pdoc.docId}`,
        })),
        current,
      ));
    } catch {
      notifications.show({ title: t('Problem search failed'), message: '', color: 'red' });
    } finally {
      if (seq === problemSearchSeq.current) setProblemSearching(false);
    }
  };

  const searchUsers = async (query: string) => {
    const seq = ++userSearchSeq.current;
    if (!domainId || !query.trim()) {
      setUserSearching(false);
      return;
    }
    setUserSearching(true);
    try {
      const udocs = await callApi(domainId, 'users', { search: query, limit: 10 }, ['_id', 'uname', 'displayName', 'avatarUrl']);
      if (seq !== userSearchSeq.current) return;
      setUserOptions((current) => mergeOptions(
        udocs.map((udoc: any) => ({
          value: String(udoc._id),
          label: `${udoc.uname}${udoc.displayName ? ` (${udoc.displayName})` : ''}`,
          description: `UID = ${udoc._id}`,
          avatarUrl: udoc.avatarUrl,
        })),
        current,
      ));
    } catch {
      notifications.show({ title: t('User search failed'), message: '', color: 'red' });
    } finally {
      if (seq === userSearchSeq.current) setUserSearching(false);
    }
  };

  const handleSubmit = async (clone = false) => {
    setLoading(true);
    setError('');
    try {
      const body: any = {
        ...form,
        operation: 'update',
        content: form.content.trim() || EMPTY_MARKDOWN,
        duration: Number(form.duration),
        code: form.permission === 'invite' ? form.code : '',
        assign: form.permission === 'assign' ? form.assign : '',
        lock: showLock ? form.lock : '',
        contestDuration: showFlexibleDuration ? form.contestDuration : '',
        keepScoreboardHidden: showHiddenScoreboard ? form.keepScoreboardHidden : false,
      };
      delete body.permission;
      const res = await fetch(clone ? buildUrl('contest_create') : window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) {
        const msg = formatErrorMessage(data.error, t('Save failed'));
        setError(msg);
        notifications.show({ title: msg, message: '', color: 'red' });
      } else {
        notifications.show({ title: isNew ? t('Created successfully') : t('Saved'), message: '', color: 'green' });
        if (data.redirect) navigate(data.redirect);
        else if (data.tid) navigate(`/contest/${data.tid}`);
        else navigate(isNew ? buildUrl('contest_main') : buildUrl('contest_detail', { tid: tdoc.docId }));
      }
    } catch (err: any) {
      const msg = err?.message || t('Network error');
      setError(msg);
      notifications.show({ title: msg, message: '', color: 'red' });
    } finally {
      setLoading(false);
    }
  };

  const fileColumns = [
    { key: 'name', title: t('Filename'), render: (file: any) => <Text size="sm" fw={600}>{file.name}</Text> },
    { key: 'size', title: t('Size'), width: 90, align: 'right' as const, render: (file: any) => <Text size="xs" c="dimmed">{formatSize(file.size)}</Text> },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={isNew ? t('Create Contest') : t('Edit Contest')}>
        <Button component="a" href={buildUrl('contest_main')} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
          {t('Back')}
        </Button>
      </PageHeader>
      {error && <Text c="red" size="sm">{error}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Stack gap="lg" className="min-w-0 flex-1">
          <Card withBorder p="lg" className="hydro-content-card">
            <Group justify="space-between" mb="md">
              <Title order={3} size="h4">{t('Basic Info')}</Title>
              <Badge variant="light">{form.rule}</Badge>
            </Group>
            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md">
              <Select
                label={t('Rule')}
                data={Object.entries(rules).map(([value, label]) => ({ value, label: String(label) }))}
                value={form.rule}
                onChange={(value) => setForm({ ...form, rule: value || 'acm' })}
              />
              <TextInput
                className="sm:col-span-3"
                label={t('Title')}
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.currentTarget.value })}
                required
              />
              <TextInput label={t('Begin Date')} type="date" value={form.beginAtDate} onChange={(e) => setForm({ ...form, beginAtDate: e.currentTarget.value })} />
              <TextInput label={t('Begin Time')} type="time" value={form.beginAtTime} onChange={(e) => setForm({ ...form, beginAtTime: e.currentTarget.value })} />
              <NumberInput label={t('Duration (hours)')} value={form.duration} min={0.25} step={0.5} onChange={(value) => setForm({ ...form, duration: Number(value) || 0 })} />
              <TextInput label={t('End Time')} value={endAt} readOnly />
              <AsyncTagSelect
                className="sm:col-span-4"
                label={t('Problems')}
                placeholder={t("Seperated with ','")}
                value={selectedProblems}
                data={problemData}
                loading={problemSearching}
                onSearch={searchProblems}
                onChange={(value) => setForm({ ...form, pids: value.join(',') })}
              />
            </SimpleGrid>
          </Card>

          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="md">{t('Description')}</Title>
            <MarkdownEditor
              value={form.content}
              onChange={(content) => setForm({ ...form, content })}
              minRows={12}
              placeholder={t('Write your content in Markdown...')}
            />
          </Card>

          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="md">{t('Permission Control')}</Title>
            <Stack gap="md">
              <AsyncTagSelect
                label={t('Contest Maintainer')}
                placeholder={t('Username / UID')}
                value={selectedMaintainers}
                data={userData}
                loading={userSearching}
                withAvatar
                onSearch={searchUsers}
                onChange={(value) => setForm({ ...form, maintainer: value.join(',') })}
              />
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="md">
                <Select
                  label={t('Permission Control')}
                  value={form.permission}
                  data={[
                    { value: 'public', label: t('Public') },
                    { value: 'invite', label: t('Require Invitation Code') },
                    { value: 'assign', label: t('Assign User or Group') },
                  ]}
                  onChange={(value) => setForm({ ...form, permission: value || 'public' })}
                />
                {form.permission === 'assign' && (
                  <TextInput className="sm:col-span-2" label={t('Assign')} value={form.assign} onChange={(e) => setForm({ ...form, assign: e.currentTarget.value })} placeholder={t('Group / UID')} />
                )}
                {form.permission === 'invite' && (
                  <TextInput className="sm:col-span-2" label={t('Invitation Code')} value={form.code} onChange={(e) => setForm({ ...form, code: e.currentTarget.value })} />
                )}
              </SimpleGrid>
            </Stack>
          </Card>

          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="md">{t('Contest Settings')}</Title>
            <Stack gap="md">
              <MultiSelect
                label={t('Submission language limit')}
                placeholder={t('Unlimited')}
                data={langs}
                searchable
                clearable
                value={form.langs.split(',').map((item) => item.trim()).filter(Boolean)}
                onChange={(value) => setForm({ ...form, langs: value.join(',') })}
              />
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md">
                {showLock && (
                  <NumberInput label={t('Lock (minutes)')} value={form.lock === '' ? undefined : Number(form.lock)} min={0} onChange={(value) => setForm({ ...form, lock: value === '' ? '' : Number(value) || '' })} />
                )}
                {showFlexibleDuration && (
                  <NumberInput label={t('Flexable Duration')} value={form.contestDuration === '' ? undefined : Number(form.contestDuration)} min={0} step={0.5} onChange={(value) => setForm({ ...form, contestDuration: value === '' ? '' : Number(value) || '' })} />
                )}
              </SimpleGrid>
              <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="sm">
                <Checkbox label={t('Rated')} checked={form.rated} onChange={(e) => setForm({ ...form, rated: e.currentTarget.checked })} />
                <Checkbox label={t('Auto hide-and show')} checked={form.autoHide} onChange={(e) => setForm({ ...form, autoHide: e.currentTarget.checked })} />
                <Checkbox label={t('Allow View Code')} checked={form.allowViewCode} onChange={(e) => setForm({ ...form, allowViewCode: e.currentTarget.checked })} />
                <Checkbox label={t('Allow Print')} checked={form.allowPrint} onChange={(e) => setForm({ ...form, allowPrint: e.currentTarget.checked })} />
                {showHiddenScoreboard && (
                  <Checkbox label={t('Keep Scoreboard Hidden')} checked={form.keepScoreboardHidden} onChange={(e) => setForm({ ...form, keepScoreboardHidden: e.currentTarget.checked })} />
                )}
              </SimpleGrid>
            </Stack>
          </Card>

          <Group justify="flex-end">
            {!isNew && <Button variant="light" onClick={() => handleSubmit(true)} loading={loading}>{t('Clone')}</Button>}
            <Button onClick={() => handleSubmit(false)} loading={loading}>{isNew ? t('Create') : t('Update')}</Button>
          </Group>
        </Stack>

        <Stack gap="lg" className="w-full shrink-0 lg:w-80">
          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="md">{t('Summary')}</Title>
            <Stack gap="xs">
              <Group justify="space-between"><Text size="xs" c="dimmed">{t('Rule')}</Text><Text size="xs" fw={700}>{form.rule}</Text></Group>
              <Group justify="space-between"><Text size="xs" c="dimmed">{t('Begin Time')}</Text><Text size="xs" fw={700}>{form.beginAtDate} {form.beginAtTime}</Text></Group>
              <Group justify="space-between"><Text size="xs" c="dimmed">{t('End Time')}</Text><Text size="xs" fw={700}>{endAt || '-'}</Text></Group>
              <Group justify="space-between"><Text size="xs" c="dimmed">{t('Problems')}</Text><Text size="xs" fw={700}>{form.pids.split(',').filter((item) => item.trim()).length}</Text></Group>
            </Stack>
          </Card>

          {!isNew && (
            <Card withBorder p="lg" className="hydro-content-card">
              <Title order={3} size="h4" mb="md">{t('Files')}</Title>
              <DataTable
                columns={fileColumns}
                data={files.map((file: any) => ({ ...file, _id: file.name }))}
                emptyMessage={t('No files')}
              />
            </Card>
          )}
        </Stack>
      </div>
    </Stack>
  );
}
