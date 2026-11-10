import { Alert, Badge, Center, Group, Loader, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { Button } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';
import { objectiveCaseId } from '@/utils/objective-answers';
import { RecordStatusBadge } from './record-status-badge';
import { STATUS } from './status-map';

interface SubmissionResult {
  status?: number;
  score?: number;
  testCases?: { id?: number, subtaskId?: number, status?: number }[];
  cases?: SubmissionResult['testCases'];
  error?: unknown;
}

interface SubmissionResultModalProps {
  opened: boolean;
  record: SubmissionResult;
  onClose: () => void;
  onViewDetails: () => void;
  objective?: boolean;
}

/** A compact view of the existing permission-filtered record stream, not a second record page. */
export function SubmissionResultModal({ opened, record, onClose, onViewDetails, objective = false }: SubmissionResultModalProps) {
  const { t } = useI18n();
  const pending = record.status != null && [
    STATUS.STATUS_WAITING, STATUS.STATUS_JUDGING, STATUS.STATUS_COMPILING, STATUS.STATUS_FETCHED,
  ].includes(record.status);
  const cases = record.testCases || record.cases || [];

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={t('Judging result')}
      size={640}
      centered
      classNames={{ content: 'hydro-submission-result', body: 'hydro-submission-result__body' }}
      closeButtonProps={{ 'aria-label': t('Close') }}
    >
      <Group justify="space-between" wrap="wrap" gap="sm" aria-live="polite" aria-atomic="true">
        <Group gap="xs">
          {pending && <Loader size="xs" aria-hidden="true" />}
          <RecordStatusBadge status={record.status} size="lg" />
        </Group>
        <Group gap="xs">
          <Text size="sm" c="dimmed">{t('Score')}</Text>
          <Text size="xl" fw={700} className="hydro-numeric">{record.score ?? '—'}</Text>
        </Group>
      </Group>
      <Group gap="xs">
        <Text size="sm" fw={600}>{t('Test Cases')}</Text>
        <Badge variant="light">{cases.length}</Badge>
      </Group>
      <ScrollArea
        className="hydro-submission-result__cases"
        type="auto"
        offsetScrollbars
        viewportProps={{ tabIndex: 0, role: 'region', 'aria-label': t('Test Cases') }}
      >
        {Boolean(record.error) && (
          <Alert color="orange" title={t('Live results disconnected')} role="alert" my="sm">
            {t('Showing the last received results. Check your network connection and access permissions; refresh the page if needed.')}
          </Alert>
        )}
        {cases.length ? (
          <ul className="hydro-submission-result__list">
            {cases.map((item, index) => (
              <li key={`${item.subtaskId ?? ''}-${item.id ?? index}-${index}`} className="hydro-submission-result__case">
                <Text size="sm" className="hydro-numeric">
                  {objective ? `#${objectiveCaseId(item)}`
                    : `${t('Test Case')} #${item.subtaskId != null ? `${item.subtaskId}-` : ''}${item.id ?? index + 1}`}
                </Text>
                <RecordStatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        ) : (
          <Center mih={120}>
            <Stack gap="xs" align="center">
              <Text size="sm" c="dimmed">{t(pending ? 'Waiting for judging results' : 'No test cases to display')}</Text>
            </Stack>
          </Center>
        )}
      </ScrollArea>
      <Group justify="flex-end" gap="sm" className="hydro-submission-result__actions">
        <Button variant="default" onClick={onClose}>{t('Close')}</Button>
        <Button onClick={onViewDetails}>{t('Judging details')}</Button>
      </Group>
    </Modal>
  );
}
