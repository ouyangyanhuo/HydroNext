import { Badge, Group, NumberInput, Paper, SimpleGrid, Stack, Text, TextInput } from '@mantine/core';
import { IconPlus, IconTrash } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { ActionIcon, Button } from '@/components/common/button';
import { ConfirmDialog } from '@/components/common/confirm-dialog';
import { TagMultiSelect } from '@/components/common/select';
import { useI18n } from '@/hooks/use-i18n';
import {
  nextTrainingChapterId, normalizeTrainingProblemId, parseTrainingPlan, removeTrainingChapter, renameTrainingChapter, type TrainingChapter,
} from '@/utils/training-plan';

export interface TrainingProblemOption { value: string, label: string, description?: string }

function ChapterEditor({ chapter, preceding, options, disabled, searching, onSearch, onChange, onRename, onRemove }: {
  chapter: TrainingChapter;
  preceding: TrainingChapter[];
  options: TrainingProblemOption[];
  disabled: boolean;
  searching: boolean;
  onSearch: (query: string) => void;
  onChange: (chapter: TrainingChapter) => void;
  onRename: (id: number) => boolean;
  onRemove: () => void;
}) {
  const { t } = useI18n();
  const [idDraft, setIdDraft] = useState<number | string>(chapter._id);
  const selected = useMemo(() => [...new Set(chapter.pids.map(String))], [chapter.pids]);
  const available = useMemo(() => {
    const labels = new Map(options.map((option) => [option.value, option]));
    return [...selected.filter((id) => !labels.has(id)).map((id) => ({ value: id, label: `ID ${id}` })), ...options];
  }, [options, selected]);
  const prerequisites = preceding.map((node) => ({ value: String(node._id), label: `${node._id}. ${node.title}` }));
  for (const id of chapter.requireNids) {
    if (!prerequisites.some((option) => option.value === String(id))) {
      prerequisites.push({ value: String(id), label: `${t('Section')} ${id}` });
    }
  }
  return (
    <Paper withBorder p="md" className="hydro-content-card" data-training-chapter={chapter._id}>
      <Stack gap="md">
        <Group justify="space-between">
          <Group gap="xs">
            <Text fw={700}>{t('Section')} {chapter._id}</Text>
            <Badge variant="light">{chapter.pids.length} {t('Problems')}</Badge>
          </Group>
          <ActionIcon
            variant="subtle"
            color="red"
            disabled={disabled}
            onClick={onRemove}
            title={t('Remove chapter')}
            aria-label={t('Remove chapter')}
          >
            <IconTrash size={17} />
          </ActionIcon>
        </Group>
        <SimpleGrid cols={{ base: 1, sm: 4 }}>
          <NumberInput
            label={t('Chapter ID (_id)')}
            value={idDraft}
            min={1}
            max={Number.MAX_SAFE_INTEGER}
            allowDecimal={false}
            allowNegative={false}
            disabled={disabled}
            onChange={setIdDraft}
            onBlur={() => { if (!onRename(Number(idDraft))) setIdDraft(chapter._id); }}
          />
          <TextInput
            className="sm:col-span-3"
            label={t('Chapter title')}
            value={chapter.title}
            disabled={disabled}
            required
            onChange={(event) => onChange({ ...chapter, title: event.currentTarget.value })}
          />
        </SimpleGrid>
        <TagMultiSelect
          label={t('Prerequisite chapters')}
          description={t('Complete these earlier chapters to unlock this chapter.')}
          data={prerequisites}
          value={chapter.requireNids.map(String)}
          onChange={(value) => onChange({ ...chapter, requireNids: value.map(Number) })}
          disabled={disabled}
          clearable
          nothingFoundMessage={t('No results')}
        />
        <TagMultiSelect
          label={t('Problems')}
          description={t('Drag selected problems to reorder, or use Alt + Left/Right.')}
          data={available}
          value={selected}
          withPillsReorder
          disabled={disabled}
          searchable
          clearable
          hidePickedOptions
          nothingFoundMessage={t('No results')}
          loading={searching}
          onSearchChange={onSearch}
          onChange={(value) => onChange({ ...chapter, pids: value.map(normalizeTrainingProblemId) })}
        />
      </Stack>
    </Paper>
  );
}

export function TrainingPlanEditor({ value, onChange, options, searching, onSearch, disabled = false }: {
  value: string;
  onChange: (value: string) => void;
  options: TrainingProblemOption[];
  searching: boolean;
  onSearch: (query: string) => void;
  disabled?: boolean;
}) {
  const { t } = useI18n();
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const chapters = useMemo(() => {
    try {
      return parseTrainingPlan(value);
    } catch {
      return null;
    }
  }, [value]);
  const update = (nodes: TrainingChapter[]) => {
    setError('');
    onChange(JSON.stringify(nodes, null, 2));
  };
  if (!chapters) return <Text c="red" size="sm" role="alert">{t('Fix the JSON plan before using the chapter editor.')}</Text>;
  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Text fw={700}>{t('Chapters')}</Text>
          <Text size="xs" c="dimmed">{t('Edit chapter IDs, titles, prerequisites and problem order here.')}</Text>
        </div>
        <Button
          variant="light"
          leftSection={<IconPlus size={16} />}
          disabled={disabled}
          onClick={() => {
            const id = nextTrainingChapterId(chapters);
            update([...chapters, { _id: id, title: `${t('Section')} ${id}`, requireNids: [], pids: [] }]);
          }}
        >{t('Add chapter')}</Button>
      </Group>
      {error && <Text c="red" size="sm" role="alert">{t(error)}</Text>}
      {chapters.map((chapter, index) => (
        <ChapterEditor
          key={`${index}:${chapter._id}`}
          chapter={chapter}
          preceding={chapters.slice(0, index)}
          options={options}
          disabled={disabled}
          searching={searching}
          onSearch={onSearch}
          onChange={(next) => update(chapters.map((node, position) => position === index ? next : node))}
          onRename={(id) => {
            try {
              if (id !== chapter._id) update(renameTrainingChapter(chapters, index, id));
              return true;
            } catch (err: any) {
              setError(err.message);
              return false;
            }
          }}
          onRemove={() => setRemoveIndex(index)}
        />
      ))}
      <ConfirmDialog
        opened={removeIndex !== null}
        onClose={() => setRemoveIndex(null)}
        title={t('Remove chapter')}
        message={t('Remove this chapter and its prerequisite references? Problems themselves will not be deleted.')}
        confirmLabel={t('Remove chapter')}
        onConfirm={() => {
          if (removeIndex !== null && chapters[removeIndex]) update(removeTrainingChapter(chapters, removeIndex));
          setRemoveIndex(null);
        }}
      />
    </Stack>
  );
}
