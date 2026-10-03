import { Avatar, Group, Modal, NumberInput, Paper, PasswordInput, ScrollArea, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useEffect, useRef, useState } from 'react';
import { Button, UnstyledButton } from '@/components/common/button';
import { LongSelect } from '@/components/common/select';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

type FieldValue = string | number | boolean | null;

export interface FormDialogField {
  name: string;
  label: string;
  type?: 'text' | 'password' | 'textarea' | 'number' | 'select' | 'domain';
  placeholder?: string;
  required?: boolean;
  data?: { value: string, label: string }[];
  defaultValue?: FieldValue;
}

function DomainSelectField({
  value,
  onChange,
  label,
  placeholder,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  placeholder?: string;
}) {
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [selectedDomain, setSelectedDomain] = useState<any>(null);

  useEffect(() => {
    if (!search.trim()) return undefined;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(buildUrl('domain_search', {}, { q: search.trim() }), {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(t('Operation failed'));
        const domains = await res.json();
        if (controller.signal.aborted) return;
        if (!Array.isArray(domains)) throw new Error(formatErrorMessage(domains?.error, t('Operation failed')));
        setResults(domains.map((d: any) => ({
          _id: d._id,
          name: d.name || d._id,
          avatar: d.avatar,
        })));
      } catch (error: any) {
        if (!controller.signal.aborted) {
          setResults([]);
          setSearchError(formatErrorMessage(error, t('Network error')));
        }
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [buildUrl, search, t]);

  const selectDomain = (domain: any) => {
    setSelectedDomain(domain);
    setSearch('');
    setSearchError('');
    setResults([]);
    onChange(domain._id);
  };

  const clearSelection = () => {
    setSelectedDomain(null);
    onChange(null);
  };

  if (selectedDomain || value) {
    const domainId = selectedDomain?._id || value;
    const domainName = selectedDomain?.name || value;
    return (
      <div>
        <Text size="sm" fw={500} mb={4}>{label}</Text>
        <Group gap="sm">
          <Avatar src={selectedDomain?.avatar} size="sm" radius="xl">{domainName?.[0]?.toUpperCase()}</Avatar>
          <div>
            <Text size="sm" fw={500}>{domainName}</Text>
            <Text size="xs" c="dimmed">{domainId}</Text>
          </div>
          <Button size="compact-xs" variant="subtle" color="red" ml="auto" onClick={clearSelection}>
            {t('Change')}
          </Button>
        </Group>
      </div>
    );
  }

  return (
    <Stack gap="xs">
      <TextInput
        label={label}
        placeholder={placeholder || t('Search by domain ID or name')}
        value={search}
        onChange={(e) => {
          const nextSearch = e.currentTarget.value;
          setSearch(nextSearch);
          setSearchError('');
          setResults([]);
          setSearching(!!nextSearch.trim());
        }}
        rightSection={searching ? <Text size="xs" c="dimmed">...</Text> : null}
      />
      {results.length > 0 && (
        <Paper withBorder p={0}>
          <ScrollArea.Autosize mah={200}>
            <Stack gap={0}>
              {results.map((domain) => (
                <UnstyledButton
                  key={domain._id}
                  p="sm"
                  className="hover:bg-[var(--hydro-surface-muted)] border-b border-[var(--hydro-border)] last:border-b-0 transition-colors duration-150"
                  onClick={() => selectDomain(domain)}
                >
                  <Group gap="sm">
                    <Avatar src={domain.avatar} size="sm" radius="xl">{domain.name?.[0]?.toUpperCase()}</Avatar>
                    <div>
                      <Text size="sm" fw={500}>{domain.name}</Text>
                      <Text size="xs" c="dimmed">{domain._id}</Text>
                    </div>
                  </Group>
                </UnstyledButton>
              ))}
            </Stack>
          </ScrollArea.Autosize>
        </Paper>
      )}
      {searchError && <Text size="xs" c="red" role="alert">{searchError}</Text>}
      {search.trim() && !searching && !results.length && !searchError && (
        <Text size="xs" c="dimmed">{t('No domains found')}</Text>
      )}
    </Stack>
  );
}

export interface FormDialogProps {
  opened: boolean;
  title: string;
  fields: FormDialogField[];
  onClose: () => void;
  onSubmit: (values: Record<string, FieldValue>) => void | Promise<void>;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  error?: string;
}

function FormDialogContent({
  opened,
  title,
  fields,
  onClose,
  onSubmit,
  confirmLabel,
  cancelLabel,
  loading = false,
  error,
}: FormDialogProps) {
  const { t } = useI18n();
  const pending = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const busy = loading || submitting;
  const [values, setValues] = useState<Record<string, FieldValue>>(() => Object.fromEntries(
    fields.map((field) => [field.name, field.defaultValue ?? '']),
  ) as Record<string, FieldValue>);

  const setValue = (name: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const canSubmit = fields.every((field) => !field.required || String(values[field.name] ?? '').trim());

  const submit = async () => {
    if (busy || pending.current || !canSubmit) return;
    pending.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      await onSubmit(values);
    } catch (err: any) {
      setSubmitError(formatErrorMessage(err, t('Operation failed')));
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={() => { if (!busy) onClose(); }}
      title={title}
      size="md"
      closeOnClickOutside={!busy}
      closeOnEscape={!busy}
      closeButtonProps={{ disabled: busy }}
    >
      <form onSubmit={(event) => { event.preventDefault(); void submit(); }}>
        <Stack
          renderRoot={(props) => <fieldset {...props} disabled={busy} />}
          gap="md"
          style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
        >
          {fields.map((field) => {
            const { key: fieldKey, ...common } = {
              key: field.name,
              label: field.label,
              placeholder: field.placeholder,
              required: field.required,
              size: 'sm' as const,
            };
            if (field.type === 'textarea') {
              return (
                <Textarea
                  key={fieldKey}
                  {...common}
                  minRows={4}
                  autosize
                  value={String(values[field.name] ?? '')}
                  onChange={(e) => setValue(field.name, e.currentTarget.value)}
                />
              );
            }
            if (field.type === 'number') {
              return (
                <NumberInput
                  key={fieldKey}
                  {...common}
                  value={typeof values[field.name] === 'number' ? values[field.name] as number : undefined}
                  onChange={(value) => setValue(field.name, value)}
                />
              );
            }
            if (field.type === 'select') {
              return (
                <LongSelect
                  key={fieldKey}
                  {...common}
                  placeholder={field.placeholder || t('Select')}
                  data={field.data || []}
                  value={values[field.name] == null || values[field.name] === '' ? null : String(values[field.name])}
                  onChange={(value) => setValue(field.name, value ?? '')}
                  clearable
                />
              );
            }
            if (field.type === 'domain') {
              return (
                <DomainSelectField
                  key={field.name}
                  label={field.label}
                  placeholder={field.placeholder}
                  value={typeof values[field.name] === 'string' ? values[field.name] as string : null}
                  onChange={(value) => setValue(field.name, value)}
                />
              );
            }
            if (field.type === 'password') {
              return (
                <PasswordInput
                  key={fieldKey}
                  {...common}
                  value={String(values[field.name] ?? '')}
                  onChange={(e) => setValue(field.name, e.currentTarget.value)}
                />
              );
            }
            return (
              <TextInput
                key={fieldKey}
                {...common}
                value={String(values[field.name] ?? '')}
                onChange={(e) => setValue(field.name, e.currentTarget.value)}
              />
            );
          })}
          {(error || submitError) && <Text size="xs" c="red" role="alert">{error || submitError}</Text>}
          <Group justify="flex-end" gap="xs">
            <Button variant="default" size="xs" onClick={onClose} disabled={busy}>
              {cancelLabel ?? t('Cancel')}
            </Button>
            <Button type="submit" size="xs" disabled={!canSubmit} loading={busy}>
              {confirmLabel ?? t('Confirm')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

export function FormDialog(props: FormDialogProps) {
  const defaultsKey = props.fields.map((field) => `${field.name}:${String(field.defaultValue ?? '')}`).join('|');
  return <FormDialogContent key={`${props.opened ? 'open' : 'closed'}:${defaultsKey}`} {...props} />;
}
