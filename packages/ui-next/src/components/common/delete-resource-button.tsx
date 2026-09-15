import { Button } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useNavigate } from '@/context/router';
import { useI18n } from '@/hooks/use-i18n';
import { requestResourceDeletion } from '@/utils/delete-resource';
import { formatErrorMessage } from '@/utils/error';
import { ConfirmDialog } from './confirm-dialog';

interface DeleteResourceButtonProps {
  actionUrl: string;
  fallbackUrl: string;
  label: string;
  message: string;
}

export function DeleteResourceButton({
  actionUrl,
  fallbackUrl,
  label,
  message,
}: DeleteResourceButtonProps) {
  const { t } = useI18n();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try {
      const redirect = await requestResourceDeletion(actionUrl);
      notifications.show({ title: t('Deleted'), message: '', color: 'green' });
      await navigate(redirect || fallbackUrl);
    } catch (error: any) {
      notifications.show({
        title: formatErrorMessage(error, t('Delete failed')),
        message: '',
        color: 'red',
      });
    } finally {
      setDeleting(false);
      setOpened(false);
    }
  };

  return (
    <>
      <Button
        fullWidth
        color="red"
        variant="light"
        leftSection={<IconTrash size={15} stroke={1.8} />}
        onClick={() => setOpened(true)}
      >
        {label}
      </Button>
      <ConfirmDialog
        opened={opened}
        onClose={() => setOpened(false)}
        onConfirm={confirmDelete}
        title={label}
        message={message}
        confirmLabel={t('Delete')}
        cancelLabel={t('Cancel')}
        loading={deleting}
      />
    </>
  );
}
