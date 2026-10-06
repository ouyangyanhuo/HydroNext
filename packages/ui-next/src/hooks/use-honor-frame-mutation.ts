import { notifications } from '@mantine/notifications';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from '@/context/router';
import { useBuildUrl } from '@/hooks/use-build-url';
import { useI18n } from '@/hooks/use-i18n';
import { requestHonorFrame } from '@/utils/honor-frame-api';

export function useHonorFrameMutation() {
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const mounted = useRef(true);
  const request = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);
  const navigate = useNavigate();
  const buildUrl = useBuildUrl();
  const { t } = useI18n();
  const run = async (body: FormData | Record<string, unknown>, destination?: string) => {
    if (pending.current || !mounted.current) return false;
    pending.current = true;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    try {
      const result = await requestHonorFrame(buildUrl('manage_honor_frames'), body instanceof FormData
        ? { method: 'POST', body, signal: controller.signal }
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
      if (controller.signal.aborted) return false;
      if (result.requested !== undefined && result.matched !== result.requested) {
        notifications.show({ title: t('Some users changed during this operation. Refresh and retry.'), message: '', color: 'orange' });
      } else notifications.show({ title: t('Saved'), message: '', color: 'green' });
      try {
        await navigate(destination || window.location.pathname + window.location.search);
      } catch {
        if (mounted.current) notifications.show({ title: t('Saved. Please refresh this page.'), message: '', color: 'orange' });
      }
      return true;
    } catch (err: any) {
      if (!controller.signal.aborted) {
        notifications.show({ title: t('Operation failed'), message: t(err.message || 'Operation failed'), color: 'red' });
      }
      return false;
    } finally {
      pending.current = false;
      request.current = null;
      if (mounted.current) setBusy(false);
    }
  };
  return { busy, run };
}
