import { Stack, Text } from '@mantine/core';
import { useRef, useState } from 'react';
import { Button } from '@/components/common/button';
import { useI18n } from '@/hooks/use-i18n';
import { formatErrorMessage } from '@/utils/error';
import { canRequestProctorExit, requestProctorExit } from '@/utils/proctor';

/** 独立于比赛提交权限和导航设置，比赛结束后仍可请求客户端处理个人日志。 */
export function ProctorFinishButton({ compact = false, clientOnly = false }: { compact?: boolean, clientOnly?: boolean }) {
  const { t } = useI18n();
  const pending = useRef(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const available = canRequestProctorExit();
  if (clientOnly && !available) return null;

  const finish = async () => {
    if (pending.current) return;
    pending.current = true;
    setLoading(true);
    setError('');
    try {
      await requestProctorExit();
      // 取消、保留日志退出及上传完成均由客户端处理，不能据此宣称日志已上传。
    } catch (failure) {
      setError(formatErrorMessage(failure as Error, t('Operation failed'), t));
    } finally {
      pending.current = false;
      setLoading(false);
    }
  };

  return (
    <Stack gap={4} align={compact ? 'center' : undefined}>
      <Button
        size={compact ? 'compact-xs' : 'sm'}
        variant={compact ? 'light' : 'filled'}
        color="orange"
        disabled={!available}
        loading={loading}
        onClick={() => void finish()}
        title={t('End personal proctoring and upload log')}
      >
        {t(compact ? 'Finish proctoring' : 'End personal proctoring and upload log')}
      </Button>
      {error && <Text size="xs" c="red" role="alert">{error}</Text>}
      {!available && !compact && (
        <Text size="xs" c="dimmed">{t('Open this page in the proctor client to finish proctoring and upload your log.')}</Text>
      )}
    </Stack>
  );
}
