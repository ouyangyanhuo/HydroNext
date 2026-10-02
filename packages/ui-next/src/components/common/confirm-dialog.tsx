import { Group, Modal, Text } from '@mantine/core';
import { Button } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';

interface ConfirmDialogProps {
  opened: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  confirmColor?: string;
  loading?: boolean;
}

export function ConfirmDialog({
  opened,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  confirmColor = 'red',
  loading = false,
}: ConfirmDialogProps) {
  const { t } = useI18n();
  return (
    <Modal
      opened={opened}
      onClose={() => { if (!loading) onClose(); }}
      title={title}
      size="sm"
      closeOnClickOutside={!loading}
      closeOnEscape={!loading}
      closeButtonProps={{ disabled: loading }}
    >
      <Text size="sm" mb="md">{message}</Text>
      <Group justify="flex-end" gap="xs">
        <Button variant="default" size="xs" onClick={onClose} disabled={loading}>
          {cancelLabel ?? t('Cancel')}
        </Button>
        <Button color={confirmColor} size="xs" onClick={onConfirm} loading={loading}>
          {confirmLabel ?? t('Confirm')}
        </Button>
      </Group>
    </Modal>
  );
}
