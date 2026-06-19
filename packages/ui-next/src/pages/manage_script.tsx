import { formatErrorMessage } from '@/utils/error';
import { Badge, Button, Card, Checkbox, Group, NumberInput, Select, Stack, Text, Textarea, TextInput, Title } from '@mantine/core';
import { useEffect, useMemo, useState } from 'react';
import { PageHeader } from '@/components/common/page-header';
import { usePageData } from '@/context/page-data';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';

function normalizeScripts(scripts: any) {
  if (Array.isArray(scripts)) {
    return scripts.map((item) => {
      if (typeof item === 'string') return { id: item, description: item };
      return { id: item.id || item.name, ...item };
    }).filter((item) => item.id && !item.hidden);
  }
  return Object.entries(scripts || {})
    .map(([id, script]: [string, any]) => ({ id, ...(script || {}) }))
    .filter((item) => item.id && !item.hidden);
}

function resolveSchemaNode(schema: any, node: any = schema) {
  if (!node) return null;
  if (typeof node === 'number' || typeof node === 'string') return schema?.refs?.[node] || null;
  if (node.uid && node.refs) return node.refs[node.uid] || node;
  return node;
}

function schemaFields(script: any) {
  const schema = script?.validate || script?.schema || script?.params || script?.argsSchema;
  const root = resolveSchemaNode(schema);
  if (!root?.dict) return [];
  return Object.entries(root.dict).map(([name, raw]: [string, any]) => {
    const node = resolveSchemaNode(schema, raw);
    const options = (node?.list || [])
      .map((item: any) => resolveSchemaNode(schema, item))
      .filter((item: any) => item?.type === 'const')
      .map((item: any) => ({ value: String(item.value), label: String(item.meta?.description || item.value) }));
    return {
      name,
      type: node?.type || 'string',
      defaultValue: node?.meta?.default,
      required: !!node?.meta?.required,
      description: node?.meta?.description || '',
      options,
    };
  });
}

function initialValues(fields: any[]) {
  return Object.fromEntries(fields.map((field) => [
    field.name,
    field.defaultValue ?? (field.type === 'boolean' ? false : ''),
  ]));
}

export default function ManageScriptPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const navigate = useNavigate();
  const scripts = useMemo(() => normalizeScripts(args.scripts || {}), [args.scripts]);
  const [selected, setSelected] = useState(scripts[0]?.id || '');
  const [rawArgs, setRawArgs] = useState('{}');
  const [formArgs, setFormArgs] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const selectedScript = useMemo(() => scripts.find((script) => script.id === selected), [scripts, selected]);
  const fields = useMemo(() => schemaFields(selectedScript), [selectedScript]);

  useEffect(() => {
    setFormArgs(initialValues(fields));
    setRawArgs('{}');
  }, [selected, fields]);

  const handleRun = async () => {
    if (!selected) return;
    setLoading(true);
    setError('');
    try {
      const payloadArgs = fields.length ? JSON.stringify(formArgs) : (rawArgs || '{}');
      if (!fields.length) JSON.parse(payloadArgs);
      const res = await fetch(window.location.href, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ id: selected, args: payloadArgs }),
      });
      const type = res.headers.get('content-type') || '';
      const data = type.includes('json') ? await res.json() : {};
      if (!res.ok || data.error) setError(formatErrorMessage(data.error, t('Run failed')));
      else if (data.redirect) navigate(data.redirect);
      else if (data.rid) navigate(`/record/${data.rid}`);
    } catch (err: any) {
      setError(err?.message || t('Invalid JSON'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Stack gap="lg">
      <PageHeader title={t('Scripts')} />
      {error && <Text c="red" size="sm">{error}</Text>}

      <div className="flex flex-col gap-6 lg:flex-row">
        <Card withBorder p="lg" className="hydro-content-card min-w-0 flex-1">
          <Group justify="space-between" mb="md">
            <Title order={3} size="h4">{t('Run script')}</Title>
            <Badge variant="light">{scripts.length}</Badge>
          </Group>
          <Stack gap="md">
            <Select
              label={t('Script')}
              data={scripts.map((script) => ({ value: script.id, label: `${script.id} - ${t(script.description || 'None')}` }))}
              value={selected}
              onChange={(value) => setSelected(value || '')}
              searchable
            />
            {fields.length ? (
              <Stack gap="sm">
                {fields.map((field) => {
                  if (field.options.length) {
                    return (
                      <Select
                        key={field.name}
                        label={field.name}
                        description={field.description ? t(field.description) : undefined}
                        data={field.options}
                        value={formArgs[field.name] == null ? '' : String(formArgs[field.name])}
                        required={field.required}
                        onChange={(value) => setFormArgs((prev) => ({ ...prev, [field.name]: value || '' }))}
                      />
                    );
                  }
                  if (field.type === 'boolean') {
                    return (
                      <Checkbox
                        key={field.name}
                        label={field.name}
                        description={field.description ? t(field.description) : undefined}
                        checked={!!formArgs[field.name]}
                        onChange={(e) => setFormArgs((prev) => ({ ...prev, [field.name]: e.currentTarget.checked }))}
                      />
                    );
                  }
                  if (field.type === 'number') {
                    return (
                      <NumberInput
                        key={field.name}
                        label={field.name}
                        description={field.description ? t(field.description) : undefined}
                        value={Number(formArgs[field.name] || 0)}
                        required={field.required}
                        onChange={(value) => setFormArgs((prev) => ({ ...prev, [field.name]: value }))}
                      />
                    );
                  }
                  return (
                    <TextInput
                      key={field.name}
                      label={field.name}
                      description={field.description ? t(field.description) : undefined}
                      value={String(formArgs[field.name] ?? '')}
                      required={field.required}
                      onChange={(e) => setFormArgs((prev) => ({ ...prev, [field.name]: e.currentTarget.value }))}
                    />
                  );
                })}
              </Stack>
            ) : (
              <Textarea
                label={t('Params')}
                value={rawArgs}
                minRows={8}
                autosize
                onChange={(e) => setRawArgs(e.currentTarget.value)}
                styles={{ input: { fontFamily: 'var(--hydro-font-mono)' } }}
              />
            )}
            <Group justify="flex-end">
              <Button onClick={handleRun} loading={loading}>{t('Run')}</Button>
            </Group>
          </Stack>
        </Card>

        <Card withBorder p="lg" className="hydro-content-card w-full shrink-0 lg:w-80">
          <Title order={3} size="h4" mb="sm">{selectedScript?.id || t('Script')}</Title>
          <Text size="sm" c="dimmed">{t(selectedScript?.description || 'None')}</Text>
          {fields.length > 0 && (
            <Stack gap={4} mt="md">
              <Badge variant="light">{fields.length} {t('Params')}</Badge>
              {fields.map((field) => (
                <Text key={field.name} size="xs" c="dimmed">
                  {field.name}: {field.type}
                </Text>
              ))}
            </Stack>
          )}
        </Card>
      </div>
    </Stack>
  );
}
