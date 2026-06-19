import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Group, NumberInput, Paper, Popover, SimpleGrid, Stack, Switch, Tabs, Text, TextInput, Title } from '@mantine/core';
import { useRef, useState } from 'react';
import { MarkdownEditor } from '@/components/editor/markdown-editor';
import { DataTable } from '@/components/common/data-table';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { useSessionStore } from '@/stores/session';
import { extractLocalizedContent } from '@/utils/i18n-content';

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

const FALLBACK_STATEMENT_LANGS: Record<string, string> = {
  zh: '简体中文',
  zh_TW: '繁體中文',
  en: 'English',
  ja: '日本語',
  ko: '한국어',
};

function normalizeStatementLangs(statementLangs: any) {
  if (statementLangs && typeof statementLangs === 'object') {
    const entries = Array.isArray(statementLangs)
      ? statementLangs.map((item) => (Array.isArray(item) ? item : [item, item]))
      : Object.entries(statementLangs);
    const normalized = entries
      .map(([key, label]) => [String(key), String(label || key)] as [string, string])
      .filter(([key]) => key);
    if (normalized.length) return normalized;
  }
  return Object.entries(FALLBACK_STATEMENT_LANGS);
}

function normalizeContent(content: any, defaultLang: string) {
  if (!content) return { [defaultLang]: '' };
  if (typeof content === 'object' && !Array.isArray(content)) {
    return Object.fromEntries(Object.entries(content).map(([lang, value]) => [
      lang,
      typeof value === 'string' ? value : JSON.stringify(value, null, 2),
    ]));
  }
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return normalizeContent(parsed, defaultLang);
    } catch { /* plain markdown */ }
    return { [defaultLang]: content };
  }
  return { [defaultLang]: String(content) };
}

function serializeContent(content: Record<string, string>) {
  const clean = Object.fromEntries(
    Object.entries(content).filter(([, value]) => value.trim()),
  );
  return JSON.stringify(clean);
}

function getContentForLang(content: Record<string, string>, lang: string) {
  if (content[lang] !== undefined) return content[lang];
  const prefix = Object.keys(content).find((key) => key.startsWith(lang));
  return prefix ? content[prefix] : '';
}

function StatementEditor({
  value,
  onChange,
  langs,
  initialLang,
}: {
  value: Record<string, string>;
  onChange: (value: Record<string, string>) => void;
  langs: [string, string][];
  initialLang: string;
}) {
  const { t } = useI18n();
  const firstLang = langs.find(([lang]) => lang === initialLang)?.[0] || langs[0]?.[0] || 'zh';
  const [activeLang, setActiveLang] = useState(firstLang);
  const editorValue = getContentForLang(value, activeLang);

  const updateActiveLang = (content: string) => {
    const next = { ...value };
    if (content.trim()) next[activeLang] = content;
    else delete next[activeLang];
    onChange(next);
  };

  return (
    <Stack gap="xs">
      <Group justify="space-between" align="center">
        <div>
          <Text size="sm" fw={800}>{t('Content (Markdown)')}</Text>
        </div>
        <Badge variant="light" color="gray">{activeLang}</Badge>
      </Group>
      <Tabs value={activeLang} onChange={(value) => value && setActiveLang(value)}>
        <Tabs.List>
          {langs.map(([lang, label]) => (
            <Tabs.Tab key={lang} value={lang}>
              {label}
              {value[lang]?.trim() ? <span className="ml-1 text-[var(--hydro-primary)]">•</span> : null}
            </Tabs.Tab>
          ))}
        </Tabs.List>
      </Tabs>
      <MarkdownEditor
        key={activeLang}
        value={editorValue}
        onChange={updateActiveLang}
        minRows={18}
        placeholder={t('Write your content in Markdown...')}
      />
    </Stack>
  );
}

function selectedTagSet(tagText: string) {
  return new Set(tagText.split(',').map((item) => item.trim()).filter(Boolean));
}

function normalizeProblemId(pid: string) {
  const value = pid.trim();
  if (/^\d+$/.test(value)) return `P${value}`;
  return value;
}

function isValidProblemId(pid: string) {
  return /^(?:[a-z0-9]{1,10}-)?[a-z][a-z0-9]*$/i.test(pid);
}

export default function ProblemEditPage() {
  const { args } = usePageData();
  const { t, language } = useI18n();
  const navigate = useNavigate();
  const pdoc = args.pdoc || {};
  const isNew = !pdoc.docId;
  const categories = normalizeCategories(args.categories || {});
  const additionalFiles = args.additional_file || args.additionalFiles || pdoc.additional_file || [];
  const statementLangs = normalizeStatementLangs(args.statementLangs);
  const currentLang = useSessionStore((s) => s.language);
  const initialStatementLang = statementLangs.find(([lang]) => lang === currentLang)?.[0]
    || statementLangs.find(([lang]) => lang === language)?.[0]
    || statementLangs[0]?.[0]
    || 'zh';

  const [form, setForm] = useState({
    pid: pdoc.pid || '',
    title: extractLocalizedContent(pdoc.title || '', language),
    content: normalizeContent(pdoc.content, initialStatementLang),
    tag: (pdoc.tag || []).join(', '),
    difficulty: pdoc.difficulty || 0,
    hidden: pdoc.hidden || false,
  });
  const [showCategory, setShowCategory] = useState<string | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    setLoading(true);
    setError('');
    try {
      const body: any = { ...form };
      body.pid = normalizeProblemId(body.pid || '');
      if (!isValidProblemId(body.pid)) {
        setError(t('Problem ID must start with a letter and contain only letters and numbers.'));
        setLoading(false);
        return;
      }
      body.tag &&= body.tag.split(',').map((s: string) => s.trim()).filter(Boolean);
      body.difficulty = Number(body.difficulty) || 0;
      body.content = serializeContent(form.content);
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

  const toggleTag = (tag: string) => {
    const tags = form.tag.split(',').map((item) => item.trim()).filter(Boolean);
    const next = tags.includes(tag) ? tags.filter((item) => item !== tag) : [...tags, tag];
    setForm({ ...form, tag: next.join(', ') });
  };
  const selectedTags = selectedTagSet(form.tag);

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
              <TextInput
                className="sm:col-span-1"
                label={t('Problem ID')}
                value={form.pid}
                onChange={(e) => setForm({ ...form, pid: e.currentTarget.value })}
                onBlur={(e) => setForm({ ...form, pid: normalizeProblemId(e.currentTarget.value) })}
              />
              <TextInput className="sm:col-span-2" label={t('Title')} value={form.title} onChange={(e) => setForm({ ...form, title: e.currentTarget.value })} required />
              <NumberInput label={t('Difficulty')} value={form.difficulty} min={0} max={10} onChange={(value) => setForm({ ...form, difficulty: Number(value) || 0 })} />
            </SimpleGrid>
            <StatementEditor
              value={form.content}
              onChange={(content) => setForm({ ...form, content })}
              langs={statementLangs}
              initialLang={initialStatementLang}
            />
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
            {categories.length ? (
              <div className="relative grid grid-cols-2 gap-1 overflow-visible">
                {categories.map(([category, children]) => {
                  const hasChildren = children.length > 0;
                  const selected = selectedTags.has(category) || children.some((tag) => selectedTags.has(tag));
                  return (
                    <Popover
                      key={category}
                      opened={showCategory === category && hasChildren}
                      position="left-start"
                      offset={8}
                      shadow="lg"
                      withinPortal
                      zIndex={1000}
                    >
                      <Popover.Target>
                        <div
                          className="relative"
                          onMouseEnter={() => {
                            if (hoverTimer.current) {
                              clearTimeout(hoverTimer.current);
                              hoverTimer.current = null;
                            }
                            setShowCategory(category);
                          }}
                          onMouseLeave={() => { hoverTimer.current = setTimeout(() => setShowCategory(null), 200); }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleTag(category)}
                            className={`w-full rounded-md border px-2 py-1.5 text-left text-sm font-bold transition-colors ${selected ? 'border-[var(--hydro-primary)] bg-[var(--hydro-primary-soft)] text-[var(--hydro-primary)]' : 'border-transparent hover:border-[var(--hydro-border)] hover:bg-[var(--hydro-surface)]'}`}
                          >
                            <Group justify="space-between" gap="xs" wrap="nowrap">
                              <Text size="sm" fw={700} truncate>{category}</Text>
                              {hasChildren && <Text size="xs" c="dimmed">›</Text>}
                            </Group>
                          </button>
                        </div>
                      </Popover.Target>
                      {hasChildren && (
                        <Popover.Dropdown
                          className="w-[320px] border-[var(--hydro-border)] bg-[var(--hydro-surface-raised)]"
                          onMouseEnter={() => {
                            if (hoverTimer.current) {
                              clearTimeout(hoverTimer.current);
                              hoverTimer.current = null;
                            }
                          }}
                          onMouseLeave={() => { hoverTimer.current = setTimeout(() => setShowCategory(null), 200); }}
                        >
                          <Text size="xs" fw={800} c="dimmed" mb="xs">{category}</Text>
                          <Group gap={6}>
                            {children.map((tag) => (
                              <Badge
                                key={tag}
                                variant={selectedTags.has(tag) ? 'filled' : 'light'}
                                color={selectedTags.has(tag) ? 'hydroTeal' : 'gray'}
                                className="cursor-pointer"
                                onClick={() => toggleTag(tag)}
                              >
                                {tag}
                              </Badge>
                            ))}
                          </Group>
                        </Popover.Dropdown>
                      )}
                    </Popover>
                  );
                })}
              </div>
            ) : (
              <Text c="dimmed" size="sm">{t('No categories')}</Text>
            )}
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
