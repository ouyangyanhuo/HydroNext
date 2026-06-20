import {
  Badge, Button, Card, Checkbox, Group, Modal, NumberInput,
  Paper, SimpleGrid, Stack, Table, Text, Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconArrowLeft } from '@tabler/icons-react';
import { useState } from 'react';
import { FileDropzone } from '@/components/common/file-dropzone';
import { PageHeader } from '@/components/common/page-header';
import { Link } from '@/components/link';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

function formatSize(size?: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function ContestManageSidebar({ tdoc }: { tdoc: any }) {
  const { t } = useI18n();
  const tid = tdoc.docId || tdoc._id;
  const items = [
    { label: 'Edit Contest', to: 'contest_edit' },
    { label: 'Clarifications', to: 'contest_clarification' },
    { label: 'Participants', to: 'contest_user' },
    { label: 'Balloons', to: 'contest_balloon' },
    { label: 'Scoreboard', to: 'contest_scoreboard' },
  ];

  return (
    <Card withBorder p="md" className="hydro-panel">
      <Stack gap="xs">
        <Text size="sm" fw={800}>{t('Contest Management')}</Text>
        {items.map((item) => (
          <Button key={item.to} component={Link} to={item.to} params={{ tid }} variant="subtle" justify="flex-start" size="xs" fullWidth>
            {t(item.label)}
          </Button>
        ))}
      </Stack>
    </Card>
  );
}

function FileSection({
  title,
  type,
  files,
  tid,
  selected,
  onSelectedChange,
  onDelete,
  onUploaded,
}: {
  title: string;
  type: 'public' | 'private';
  files: any[];
  tid: string;
  selected: string[];
  onSelectedChange: (value: string[]) => void;
  onDelete: () => void;
  onUploaded: () => void;
}) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();

  const toggle = (name: string, checked: boolean) => {
    onSelectedChange(checked ? [...selected, name] : selected.filter((item) => item !== name));
  };

  const allSelected = files.length > 0 && files.every((file) => selected.includes(file.name));

  return (
    <Card withBorder p="md" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
      <Stack gap="md">
        <Group justify="space-between" align="center">
          <div>
            <Title order={3} size="h5">{title}</Title>
            <Text size="xs" c="dimmed">{type === 'public' ? t('Public') : t('Only Partic.')}</Text>
          </div>
          <Button size="xs" variant="light" disabled={!selected.length} onClick={onDelete}>
            {t('Remove Selected')}
          </Button>
        </Group>

        <FileDropzone
          action={window.location.href}
          fields={{ operation: 'upload_file', type }}
          multiple={false}
          onComplete={onUploaded}
          onError={(message) => notifications.show({ title: message, message: '', color: 'red' })}
        />

        <Paper withBorder className="overflow-hidden">
          <Table striped highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th className="w-10">
                  <Checkbox
                    size="xs"
                    checked={allSelected}
                    indeterminate={selected.length > 0 && !allSelected}
                    onChange={(event) => onSelectedChange(event.currentTarget.checked ? files.map((file) => file.name) : [])}
                  />
                </Table.Th>
                <Table.Th>{t('Filename')}</Table.Th>
                <Table.Th className="w-28">{t('Size')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {files.length ? files.map((file) => (
                <Table.Tr key={file.name}>
                  <Table.Td>
                    <Checkbox size="xs" checked={selected.includes(file.name)} onChange={(event) => toggle(file.name, event.currentTarget.checked)} />
                  </Table.Td>
                  <Table.Td>
                    <Link
                      href={buildUrl('contest_file_download', { tid, type, filename: file.name })}
                      className="hydro-subtle-link"
                    >
                      <Text size="sm" fw={600}>{file.name}</Text>
                    </Link>
                  </Table.Td>
                  <Table.Td><Text size="xs" c="dimmed">{formatSize(file.size)}</Text></Table.Td>
                </Table.Tr>
              )) : (
                <Table.Tr>
                  <Table.Td colSpan={3}><Text size="sm" c="dimmed" ta="center" py="md">{t('No files')}</Text></Table.Td>
                </Table.Tr>
              )}
            </Table.Tbody>
          </Table>
        </Paper>
      </Stack>
    </Card>
  );
}

export default function ContestManagePage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const tdoc = args.tdoc || {};
  const pdict = args.pdict || {};
  const tid = String(tdoc.docId || tdoc._id || '');
  const pids = tdoc.pids || Object.keys(pdict).map((pid) => Number(pid));
  const [scores, setScores] = useState<Record<string, number>>(() => {
    const result: Record<string, number> = {};
    for (const pid of pids) result[String(pid)] = Number(tdoc.score?.[pid] || 100);
    return result;
  });
  const [scoreTarget, setScoreTarget] = useState<any>(null);
  const [scoreDraft, setScoreDraft] = useState(100);
  const [savingScore, setSavingScore] = useState(false);
  const [publicSelected, setPublicSelected] = useState<string[]>([]);
  const [privateSelected, setPrivateSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState('');

  const postJson = async (payload: Record<string, any>, fallback: string) => {
    const res = await fetch(window.location.href, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(formatErrorMessage(data.error, fallback));
    return data;
  };

  const openScore = (pid: number) => {
    setScoreTarget(pid);
    setScoreDraft(scores[String(pid)] || 100);
  };

  const saveScore = async () => {
    if (!scoreTarget || !Number.isFinite(scoreDraft) || scoreDraft <= 0) {
      notifications.show({ title: t('Invalid score'), message: '', color: 'red' });
      return;
    }
    setSavingScore(true);
    try {
      await postJson({ operation: 'set_score', pid: scoreTarget, score: scoreDraft }, t('Failed'));
      setScores((current) => ({ ...current, [String(scoreTarget)]: scoreDraft }));
      notifications.show({ title: t('Score Updated'), message: '', color: 'green' });
      setScoreTarget(null);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setSavingScore(false);
    }
  };

  const deleteFiles = async (type: 'public' | 'private') => {
    const selected = type === 'public' ? publicSelected : privateSelected;
    if (!selected.length) return;
    setDeleting(type);
    try {
      await postJson({ operation: 'delete_files', type, files: selected }, t('Failed'));
      if (type === 'public') setPublicSelected([]);
      else setPrivateSelected([]);
      notifications.show({ title: t('Deleted'), message: '', color: 'green' });
      navigate(window.location.pathname + window.location.search);
    } catch (err: any) {
      notifications.show({ title: err.message || t('Failed'), message: '', color: 'red' });
    } finally {
      setDeleting('');
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={`${t('Manage')} - ${tdoc.title}`}>
        <Group gap="xs">
          <Button component="a" href={`/contest/${tid}`} variant="subtle" size="xs" leftSection={<IconArrowLeft size={14} />}>
            {t('Back')}
          </Button>
          <Button component={Link} to="contest_edit" params={{ tid }} size="xs" variant="light">{t('Edit')}</Button>
        </Group>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="min-w-0 flex-1">
          <Stack gap="lg">
            <Card withBorder p="md" className="border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]">
              <Stack gap="md">
                <Group justify="space-between">
                  <Title order={2} size="h4">{t('Problems')}</Title>
                </Group>
                <Paper withBorder className="overflow-hidden">
                  <Table striped highlightOnHover>
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th className="w-24">{t('ID')}</Table.Th>
                        <Table.Th>{t('Problem')}</Table.Th>
                        <Table.Th className="w-28 text-right">{t('Score')}</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {pids.map((pid: number, index: number) => {
                        const pdoc = pdict[pid] || pdict[String(pid)] || {};
                        return (
                          <Table.Tr key={pid}>
                            <Table.Td><Text size="xs" ff="monospace">{pdoc.docId || pid}</Text></Table.Td>
                            <Table.Td>
                              <Link to="problem_detail" params={{ pid }} className="hydro-subtle-link">
                                <Text size="sm" fw={700}>{String.fromCharCode(65 + index)}. {pdoc.title || pid}</Text>
                              </Link>
                            </Table.Td>
                            <Table.Td className="text-right">
                              <Button size="compact-xs" variant="subtle" onClick={() => openScore(pid)}>
                                {scores[String(pid)] || 100}
                              </Button>
                            </Table.Td>
                          </Table.Tr>
                        );
                      })}
                    </Table.Tbody>
                  </Table>
                </Paper>
              </Stack>
            </Card>

            <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
              <FileSection
                title={t('Files')}
                type="public"
                files={args.files || []}
                tid={tid}
                selected={publicSelected}
                onSelectedChange={setPublicSelected}
                onDelete={() => deleteFiles('public')}
                onUploaded={() => navigate(window.location.pathname + window.location.search)}
              />
              <FileSection
                title={t('Materials')}
                type="private"
                files={args.privateFiles || []}
                tid={tid}
                selected={privateSelected}
                onSelectedChange={setPrivateSelected}
                onDelete={() => deleteFiles('private')}
                onUploaded={() => navigate(window.location.pathname + window.location.search)}
              />
            </SimpleGrid>
          </Stack>
        </div>

        <div className="w-full shrink-0 lg:w-72">
          <ContestManageSidebar tdoc={tdoc} />
        </div>
      </div>

      <Modal opened={!!scoreTarget} onClose={() => setScoreTarget(null)} title={t('Set Score for Contest')}>
        <Stack gap="md">
          <NumberInput label={t('score')} value={scoreDraft} min={1} step={1} onChange={(value) => setScoreDraft(Number(value) || 0)} />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={() => setScoreTarget(null)}>{t('Cancel')}</Button>
            <Button onClick={saveScore} loading={savingScore}>{t('Save')}</Button>
          </Group>
        </Stack>
      </Modal>

      {deleting && <Text size="xs" c="dimmed">{t('Deleting')}...</Text>}
    </Stack>
  );
}
