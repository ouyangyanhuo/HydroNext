import { Paper, Tabs, Text, Textarea } from '@mantine/core';
import { useState } from 'react';
import { MarkdownRenderer } from '@/components/markdown/markdown-renderer';
import { useI18n } from '@/hooks/use-i18n';

interface MarkdownEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  minRows?: number;
  placeholder?: string;
}

export function MarkdownEditor({
  value,
  onChange,
  readOnly = false,
  minRows = 8,
  placeholder,
}: MarkdownEditorProps) {
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<string | null>('write');
  const panelHeight = Math.max(minRows * 24, 160);

  return (
    <Tabs value={activeTab} onChange={setActiveTab}>
      <Tabs.List>
        <Tabs.Tab value="write">{t('Write')}</Tabs.Tab>
        <Tabs.Tab value="preview">{t('Preview')}</Tabs.Tab>
      </Tabs.List>

      <Tabs.Panel value="write" pt="xs">
        <Textarea
          value={value}
          onChange={(e) => onChange?.(e.currentTarget.value)}
          readOnly={readOnly}
          minRows={minRows}
          maxRows={minRows + 8}
          placeholder={placeholder || t('Write your content in Markdown...')}
          styles={{ input: { fontFamily: 'var(--hydro-font-mono)', fontSize: '14px', minHeight: panelHeight, maxHeight: panelHeight, overflowY: 'auto' } }}
        />
      </Tabs.Panel>

      <Tabs.Panel value="preview" pt="xs">
        <Paper
          p="md"
          withBorder
          className="overflow-auto"
          style={{ minHeight: panelHeight, maxHeight: panelHeight }}
        >
          {value ? (
            <MarkdownRenderer content={value} />
          ) : (
            <Text c="dimmed" size="sm">{t('Nothing to preview')}</Text>
          )}
        </Paper>
      </Tabs.Panel>
    </Tabs>
  );
}
