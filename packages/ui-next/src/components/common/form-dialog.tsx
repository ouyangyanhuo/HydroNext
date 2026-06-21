import { Avatar, Button, Group, Modal, NumberInput, PasswordInput, Paper, ScrollArea, Stack, Text, Textarea, TextInput, UnstyledButton } from '@mantine/core';
import { useEffect, useState } from 'react';

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
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedDomain, setSelectedDomain] = useState<any>(null);

  useEffect(() => {
    if (!search.trim()) {
      setResults([]);
      return undefined;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const params = new URLSearchParams();
        params.set('q', search.trim());
        const res = await fetch(`/domain/search?${params.toString()}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const domains = await res.json();
        setResults((domains || []).map((d: any) => ({
          _id: d._id,
          name: d.name || d._id,
          avatar: d.avatar,
        })));
      } catch {
        // ignore
      } finally {
        if (!controller.signal.aborted) setSearching(false);
      }
    }, 300);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search]);

  const selectDomain = (domain: any) => {
    setSelectedDomain(domain);
    setSearch('');
    setResults([]);
    onChange(domain._id);
  };

  const clearSelection = () => {
    setSelectedDomain(null);
    onChange(null);
  };

  if (selectedDomain) {
    return (
      <div>
        <Text size="sm" fw={500} mb={4}>{label}</Text>
        <Group gap="sm">
          <Avatar src={selectedDomain.avatar} size="sm" radius="xl">{selectedDomain.name?.[0]?.toUpperCase()}</Avatar>
          <div>
            <Text size="sm" fw={500}>{selectedDomain.name}</Text>
            <Text size="xs" c="dimmed">{selectedDomain._id}</Text>
          </div>
          <Button size="compact-xs" variant="subtle" color="red" ml="auto" onClick={clearSelection}>
            Change
          </Button>
        </Group>
      </div>
    );
  }

  return (
    <Stack gap="xs">
      <TextInput
        label={label}
        placeholder={placeholder || 'Search by domain ID or name'}
        value={search}
        onChange={(e) => setSearch(e.currentTarget.value)}
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
                  className="hover:bg-[var(--hydro-surface-muted)] border-b border-[var(--hydro-border)] last:border-b-0"
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
      {search.trim() && !searching && !results.length && (
        <Text size="xs" c="dimmed">No domains found</Text>
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

export function FormDialog({
  opened,
  title,
  fields,
  onClose,
  onSubmit,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  loading = false,
  error,
}: FormDialogProps) {
  const [values, setValues] = useState<Record<string, FieldValue>>({});

  useEffect(() => {
    if (!opened) return;
    setValues(Object.fromEntries(
      fields.map((field) => [field.name, field.defaultValue ?? '']),
    ) as Record<string, FieldValue>);
  }, [opened]);

  const setValue = (name: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [name]: value }));
  };

  const canSubmit = fields.every((field) => !field.required || String(values[field.name] ?? '').trim());

  return (
    <Modal opened={opened} onClose={onClose} title={title} size="md">
      <Stack gap="md">
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
              <div key={field.name}>
                <Text size="sm" fw={500} mb={4}>{field.label}</Text>
                <select
                  value={String(values[field.name] ?? '')}
                  onChange={(e) => setValue(field.name, e.target.value)}
                  className="w-full rounded border border-[var(--hydro-border)] bg-[var(--hydro-surface)] p-2 text-sm"
                >
                  <option value="">Select...</option>
                  {(field.data || []).map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
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
        {error && <Text size="xs" c="red">{error}</Text>}
        <Group justify="flex-end" gap="xs">
          <Button variant="default" size="xs" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button size="xs" onClick={() => onSubmit(values)} disabled={!canSubmit} loading={loading}>
            {confirmLabel}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
