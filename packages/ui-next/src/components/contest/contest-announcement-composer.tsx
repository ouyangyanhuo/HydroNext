import { notifications } from '@mantine/notifications';
import { IconSpeakerphone } from '@tabler/icons-react';
import { useState } from 'react';
import { Button } from '@/components/common/button';
import { FormDialog } from '@/components/common/form-dialog';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';

export function ContestAnnouncementComposer({ enabled }: { enabled: boolean }) {
  const { t } = useI18n();
  const [opened, setOpened] = useState(false);
  return (
    <>
      <Button
        size="xs"
        disabled={!enabled}
        title={enabled ? t('Send to all registered participants') : t('Announcements are available while the contest is running.')}
        leftSection={<IconSpeakerphone size={15} />}
        onClick={() => setOpened(true)}
      >
        {t('Send announcement')}
      </Button>
      <FormDialog
        opened={opened}
        onClose={() => setOpened(false)}
        title={t('Contest announcement')}
        confirmLabel={t('Send announcement')}
        fields={[{ name: 'content', label: t('Announcement content (up to 4000 characters)'), type: 'textarea', required: true }]}
        onSubmit={async (values) => {
          const content = String(values.content || '').trim();
          if (!content || content.length > 4000) throw new Error(t('Announcement content (up to 4000 characters)'));
          const response = await fetch(window.location.pathname, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ operation: 'announcement', content }),
          });
          const data = await response.json();
          if (!response.ok || data.error) throw new Error(formatErrorMessage(data.error, t('Operation failed')));
          setOpened(false);
          notifications.show({
            title: t('Announcement sent'),
            message: t('Sent to {count} participants.', { count: data.recipients }),
            color: 'green',
          });
        }}
      />
    </>
  );
}
