import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Group, NumberInput, Paper, SimpleGrid, Stack, Switch, Text, TextInput, Title } from '@mantine/core';
import { useState } from 'react';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

function normalizeCategories(categories: any) {
  if (categories && typeof categories === 'object' && !Array.isArray(categories)) {
    return Object.entries(categories).map(([name, children]) => [name, Array.isArray(children) ? children : []] as [string, string[]]);
  }
  return [];
}

function formatSize(size?: number) {
  if (!size) return '0 B';
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export default function ProblemEditPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const isNew = !pdoc.docId;
  const categories = normalizeCategories(args.categories || {});
  const additionalFiles = args.additional_file || [];

  const [form, setForm] = useState({
    pid: pdoc.pid || '',
    title: pdoc.title || '',
    content: pdoc.content || '',
    tag: (pdoc.tag || []).join(', '),
    difficulty: pdoc.difficulty || 0,
    hidden: pdoc.hidden || false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const body: any = { ...form };
      body.tag &&= body.tag.split(',').map((s: string) => s.trim()).filter(Boolean);
      body.difficulty = Number(body.difficulty) || 0;
      const url = window.location.href;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) setError(formatErrorMessage(data.error, t('Save failed')));
      else if (data.redirect) navigate(data.redirect);
      else if (data.pid) navigate(`/p/${data.pid}`);
      else navigate(isNew ? '/p' : `/p/${body.pid || pdoc.docId}`);
    } catch { setError('Network error'); } finally { setLoading(false); }
  };

  const addTag = (tag: string) => {
    const tags = form.tag.split(',').map((item) => item.trim()).filter(Boolean);
    if (!tags.includes(tag)) tags.push(tag);
    setForm({ ...form, tag: tags.join(', ') });
  };

  const fileColumns = [
    { key: 'name', title: t('Filename'), render: (file: any) => <Text size="sm" fw={600}>{file.name}</Text> },
    { key: 'size', title: t('Size'), width: 90, align: 'right' as const, render: (file: any) => <Text size="xs" c="dimmed">{formatSize(file.size)}</Text> },
  ];

  return (
    <Stack gap="lg">
      <PageHeader title={isNew ? t('Create Problem') : t('Edit Problem')} />
      {error && <Text c="red" size="sm">{error}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Paper withBorder p="lg" className="min-w-0 flex-1">
          <Stack gap="md">
            <SimpleGrid cols={{ base: 1, sm: 4 }} spacing="md">
              <TextInput className="sm:col-span-1" label={t('Problem ID')} value={form.pid} onChange={(e) => setForm({ ...form, pid: e.currentTarget.value })} />
              <TextInput className="sm:col-span-2" label={t('Title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
              <NumberInput label={t('Difficulty')} value={form.difficulty} min={0} max={10} onChange={(value) => setForm({ ...form, difficulty: Number(value) || 0 })} />
            </SimpleGrid>
            <MarkdownEditor value={form.content} onChange={(v) => setForm({ ...form, content: v })} minRows={16} />
            <TextInput label={t('Tags')} value={form.tag} onChange={(e) => setForm({ ...form, tag: e.currentTarget.value })} placeholder="tag1, tag2" />
            <Switch label={t('Hidden')} checked={form.hidden} onChange={(e) => setForm({ ...form, hidden: e.currentTarget.checked })} />
            <Group justify="flex-end">
              <Button onClick={handleSubmit} loading={loading}>{isNew ? t('Create') : t('Update')}</Button>
            </Group>
          </Stack>
        </Paper>

        <Stack gap="lg" className="w-full shrink-0 lg:w-80">
          <Card withBorder p="lg" className="hydro-content-card">
            <Title order={3} size="h4" mb="xs">{t('Categories')}</Title>
            <Text size="xs" c="dimmed" mb="md">{t('click to add')}</Text>
            <Stack gap={4}>
              {categories.map(([category, children]) => (
                <div key={category} className="group/category relative rounded-md px-2 py-1.5 hover:bg-[var(--hydro-surface)] focus-within:bg-[var(--hydro-surface)]">
                  <Button variant="subtle" size="compact-sm" fullWidth justify="space-between" onClick={() => addTag(category)}>
                    {category}
                  </Button>
                  {!!children.length && (
                    <div className="pointer-events-none absolute left-[calc(100%-2px)] top-0 z-30 hidden w-[320px] rounded-md border border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)] p-3 opacity-0 shadow-[var(--hydro-shadow-lg)] group-hover/category:pointer-events-auto group-hover/category:block group-hover/category:opacity-100 group-focus-within/category:pointer-events-auto group-focus-within/category:block group-focus-within/category:opacity-100 lg:block">
                      <Group gap={6}>
                        {children.map((tag) => (
                          <Badge key={tag} variant="light" color="gray" className="cursor-pointer" onClick={() => addTag(tag)}>
                            {tag}
                          </Badge>
                        ))}
                      </Group>
                    </div>
                  )}
                </div>
              ))}
            </Stack>
          </Card>

          {!isNew && (
            <Card withBorder p="lg" className="hydro-content-card">
              <Title order={3} size="h4" mb="md">{t('Additional Files')}</Title>
              <DataTable
                columns={fileColumns}
                data={additionalFiles.map((file: any) => ({ ...file, _id: file.name }))}
                emptyMessage={t('No files')}
              />
            </Card>
          )}
        </Stack>
      </div>
    </Stack>
  );
}
