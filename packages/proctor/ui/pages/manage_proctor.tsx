import { Button, ConfirmDialog, PageHeader, PRIV, useBuildUrl, useHasPriv, useI18n, usePageData } from '@hydrooj/ui-next';
import { Alert, Card, Code, Collapse, Group, Modal, NumberInput, Stack, Switch, Text, Textarea, TextInput, Title, Transition } from '@mantine/core';
import { useReducedMotion } from '@mantine/hooks';
import { notifications } from '@mantine/notifications';
import { IconAlertTriangle } from '@tabler/icons-react';
import { useRef, useState } from 'react';
import { proctorRequest } from '../utils/proctor';
import { ProctorLogsPanel } from './manage_proctor_logs';

// Match the feature-setting motion on domain/visibility, including the reverse exit.
const FEATURE_OPTIONS_TRANSITION = {
  in: { opacity: 1, transform: 'translateX(0)' },
  out: { opacity: 0, transform: 'translateX(18px)' },
  transitionProperty: 'transform, opacity',
};
const FEATURE_OPTIONS_EASING = 'cubic-bezier(0.16, 1, 0.3, 1)';

export default function ManageProctorPage() {
  const { args } = usePageData();
  const { t } = useI18n();
  const buildUrl = useBuildUrl();
  const allowed = useHasPriv(PRIV.PRIV_EDIT_SYSTEM);
  const reducedMotion = useReducedMotion();
  const transitionDuration = reducedMotion ? 0 : 350;
  const [config, setConfig] = useState(args.config);
  const [keys, setKeys] = useState(args.keys);
  const [busy, setBusy] = useState(false);
  const pending = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [privateKeys, setPrivateKeys] = useState<any>(null);

  const run = async (body: Record<string, unknown>) => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      const result = await proctorRequest(buildUrl('manage_proctor'), body);
      if (body.operation === 'save') {
        if (result.ok !== true || typeof result.config?.enabled !== 'boolean') throw new Error('Operation failed');
        setConfig(result.config);
      }
      if (result.keys) {
        setPrivateKeys(null);
        setKeys(result.keys);
        setConfig((current: any) => ({ ...current, keyId: result.keys.keyId }));
      }
      if (result.privateKeys) setPrivateKeys(result.privateKeys);
      setConfirm(false);
      if (!result.privateKeys) notifications.show({ title: t('Saved'), message: '', color: 'green' });
    } catch (error: any) {
      notifications.show({ title: t('Operation failed'), message: t(error.message || 'Operation failed'), color: 'red' });
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  if (!allowed) return <Text>{t('Access Denied')}</Text>;
  return <Stack gap="lg">
    <PageHeader title={t('Proctor settings')} />
    <Card withBorder className="hydro-content-card" p="lg">
      <Stack gap="md">
        <Title order={3}>{t('Session policy')}</Title>
        <Stack gap={0}>
          <Group align="flex-start" gap="xl" wrap="nowrap">
            <Switch
              className="hydro-proctor-grow"
              label={t('Enable proctor service')}
              disabled={busy}
              checked={config.enabled}
              onChange={(event) => setConfig({ ...config, enabled: event.currentTarget.checked })} />
            <Transition
              mounted={config.enabled}
              transition={FEATURE_OPTIONS_TRANSITION}
              duration={transitionDuration}
              exitDuration={transitionDuration}
              timingFunction={FEATURE_OPTIONS_EASING}
            >
              {(styles) => <div className="hydro-proctor-grow" style={styles} inert={!config.enabled}>
                <Switch
                  label={t('Allow token refresh')}
                  disabled={busy || !config.enabled}
                  checked={config.refreshEnabled}
                  onChange={(event) => setConfig({ ...config, refreshEnabled: event.currentTarget.checked })} />
              </div>}
            </Transition>
          </Group>
          <Collapse
            expanded={config.enabled}
            keepMounted={false}
            transitionDuration={transitionDuration}
            transitionTimingFunction={FEATURE_OPTIONS_EASING}
          >
            <Stack gap="md" pt="md">
              <TextInput
                label={t('Required client version')}
                disabled={busy || !config.enabled}
                value={config.requiredVersion}
                onChange={(event) => setConfig({ ...config, requiredVersion: event.currentTarget.value })}
                maxLength={64} />
              <Group align="flex-start" grow>
                <NumberInput
                  label={t('Token lifetime (seconds)')}
                  disabled={busy || !config.enabled}
                  min={60}
                  max={1800}
                  allowDecimal={false}
                  value={config.tokenTtlSeconds}
                  onChange={(value) => setConfig({ ...config, tokenTtlSeconds: value })} />
                <NumberInput
                  label={t('Late upload window (days)')}
                  disabled={busy || !config.enabled}
                  min={1}
                  max={365}
                  allowDecimal={false}
                  value={config.uploadGraceDays}
                  onChange={(value) => setConfig({ ...config, uploadGraceDays: value })} />
                <NumberInput
                  label={t('Maximum log size (MiB)')}
                  disabled={busy || !config.enabled}
                  min={1}
                  max={256}
                  allowDecimal={false}
                  value={config.maxLogMiB}
                  onChange={(value) => setConfig({ ...config, maxLogMiB: value })} />
              </Group>
            </Stack>
          </Collapse>
        </Stack>
        <Group justify="flex-end"><Button loading={busy} onClick={() => void run({ operation: 'save', ...config })}>{t('Save')}</Button></Group>
      </Stack>
    </Card>
    <Card withBorder className="hydro-content-card" p="lg"><Stack gap="md">
      <Group justify="space-between"><Title order={3}>{t('Authentication keys')}</Title>
        <Button
          variant="light"
          disabled={busy}
          onClick={() => setConfirm(true)}
        >
          {t(keys ? 'Rotate authentication keys' : 'Generate authentication keys')}
        </Button>
      </Group>
      {keys ? <>
        <Text size="sm">PROCTOR_KEY_ID: <Code>{keys.keyId}</Code></Text>
        <Textarea
          label={t('Authentication public key (Ed25519)')}
          description="PROCTOR_AUTH_PUBLIC_KEY"
          value={keys.signingPublicKey}
          readOnly
          autosize
          minRows={3} />
        <Textarea
          label={t('Log encryption public key (RSA-OAEP)')}
          description="PROCTOR_LOG_PUBLIC_KEY"
          value={keys.encryptionPublicKey}
          readOnly
          autosize
          minRows={5} />
        <Text
          size="sm"
          c="dimmed"
        >
          {t(
            'Public keys are build-time trust anchors, not secrets. Never include either private key in the client.',
          )}
        </Text>
        <Group justify="flex-end"><Button
          variant="default"
          disabled={busy}
          loading={busy}
          onClick={() => void run({ operation: 'reveal_keys' })}>{t('View private keys')}</Button></Group>
      </> : <Text c="dimmed">{t('Generate authentication keys first.')}</Text>}
    </Stack></Card>
    <ProctorLogsPanel args={args} />
    <ConfirmDialog
      opened={confirm}
      onClose={() => setConfirm(false)}
      loading={busy}
      title={t(keys ? 'Rotate authentication keys' : 'Generate authentication keys')}
      message={t('Existing sessions will become invalid. Continue?')}
      onConfirm={() => void run({ operation: 'generate_keys' })} />
    {privateKeys && <Modal opened onClose={() => setPrivateKeys(null)} title={t('Private keys')} size="lg">
      <Stack gap="md">
        <Alert
          color="red"
          icon={<IconAlertTriangle size={18} />}
          title={t('Warning')}
        >
          {t(
            'Private keys are server-only. Do not put them in build variables, repositories or chat messages. '
            + 'Closing this dialog clears the display.',
          )}
        </Alert>
        <Text size="sm">{t('Authentication key ID')} (PROCTOR_KEY_ID): <Code>{privateKeys.keyId}</Code></Text>
        <Textarea label={t('Authentication private key')} value={privateKeys.signingPrivateKey} readOnly minRows={4} />
        <Textarea label={t('Log decryption private key')} value={privateKeys.encryptionPrivateKey} readOnly minRows={7} />
        <Group justify="flex-end"><Button variant="default" onClick={() => setPrivateKeys(null)}>{t('Close')}</Button></Group>
      </Stack>
    </Modal>}
  </Stack>;
}
