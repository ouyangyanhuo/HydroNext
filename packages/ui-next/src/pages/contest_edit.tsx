import { formatErrorMessage } from '@/utils/error';
import { getLangDisplay, LANG_DISPLAY } from '@/utils/lang-display';
import { Badge, Button, Card, Checkbox, Group, MultiSelect, NumberInput, Select, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMemo, useState } from 'react';
import { DataTable } from '@/components/common/data-table';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

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

export default function ContestEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
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

  const endAt = useMemo(() => addHours(form.beginAtDate, form.beginAtTime, Number(form.duration)), [form.beginAtDate, form.beginAtTime, form.duration]);
  const showLock = ['acm', 'ioi'].includes(form.rule);
  const showFlexibleDuration = ['oi', 'ioi', 'ledo', 'strictioi'].includes(form.rule);
  const showHiddenScoreboard = ['oi', 'strictioi'].includes(form.rule);
  const files = args.files || tdoc.files || [];
  const langs = languageOptions();

  const handleSubmit = async (clone = false) => {
    setLoading(true);
    setError('');
    try {
      const body: any = {
        ...form,
        operation: 'update',
        duration: Number(form.duration),
        code: form.permission === 'invite' ? form.code : '',
        assign: form.permission === 'assign' ? form.assign : '',
        lock: showLock ? form.lock : '',
        contestDuration: showFlexibleDuration ? form.contestDuration : '',
        keepScoreboardHidden: showHiddenScoreboard ? form.keepScoreboardHidden : false,
      };
      delete body.permission;
      const res = await fetch(clone ? '/contest/create' : window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else if (data.redirect) navigate(data.redirect);
      else if (data.tid) navigate(`/contest/${data.tid}`);
      else navigate(isNew ? '/contest' : `/contest/${tdoc.docId}`);
    } catch (err: any) {
      setError(err?.message || t('Network error'));
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
      <PageHeader title={isNew ? t('Create Contest') : t('Edit Contest')} />
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
              <TextInput
                className="sm:col-span-4"
                label={t('Problems')}
                value={form.pids}
                onChange={(e) => setForm({ ...form, pids: e.currentTarget.value })}
                placeholder={t("Seperated with ','")}
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
              <TextInput
                label={t('Contest Maintainer')}
                value={form.maintainer}
                onChange={(e) => setForm({ ...form, maintainer: e.currentTarget.value })}
                placeholder="UID, UID"
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
