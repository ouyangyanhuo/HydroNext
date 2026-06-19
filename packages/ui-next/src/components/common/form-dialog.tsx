import { Button, Group, Modal, NumberInput, PasswordInput, Select, Stack, Text, Textarea, TextInput } from '@mantine/core';
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
  required,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
  label: string;
  placeholder?: string;
  required?: boolean;
}) {
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<{ value: string, label: string }[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (search) params.set('q', search);
        const res = await fetch(`/domain/search${params.size ? `?${params}` : ''}`, {
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        });
        if (!res.ok) return;
        const domains = await res.json();
        setOptions((domains || []).map((domain: any) => ({
          value: domain._id,
          label: `${domain.name || domain._id} (${domain._id})`,
        })));
      } catch (err: any) {
        if (err?.name !== 'AbortError') setOptions([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 180);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [search]);

  const data = value && !options.some((option) => option.value === value)
    ? [{ value, label: value }, ...options]
    : options;

  return (
    <Select
      label={label}
      placeholder={placeholder}
      required={required}
      size="sm"
      searchable
      clearable
      data={data}
      value={value}
      onChange={onChange}
      searchValue={search}
      onSearchChange={setSearch}
      nothingFoundMessage={loading ? 'Loading...' : 'No results'}
    />
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
          const common = {
            key: field.name,
            label: field.label,
            placeholder: field.placeholder,
            required: field.required,
            size: 'sm' as const,
          };
          if (field.type === 'textarea') {
            return (
              <Textarea
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
                {...common}
                value={typeof values[field.name] === 'number' ? values[field.name] as number : undefined}
                onChange={(value) => setValue(field.name, value)}
              />
            );
          }
          if (field.type === 'select') {
            return (
              <Select
                {...common}
                data={field.data || []}
                searchable
                value={typeof values[field.name] === 'string' ? values[field.name] as string : null}
                onChange={(value) => setValue(field.name, value)}
              />
            );
          }
          if (field.type === 'domain') {
            return (
              <DomainSelectField
                key={field.name}
                label={field.label}
                placeholder={field.placeholder}
                required={field.required}
                value={typeof values[field.name] === 'string' ? values[field.name] as string : null}
                onChange={(value) => setValue(field.name, value)}
              />
            );
          }
          if (field.type === 'password') {
            return (
              <PasswordInput
                {...common}
                value={String(values[field.name] ?? '')}
                onChange={(e) => setValue(field.name, e.currentTarget.value)}
              />
            );
          }
          return (
            <TextInput
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
