/* eslint-disable react-refresh/only-export-components -- Addon setup and slot definitions are registration modules. */
import {
  Button, Link, type PluginDefinition, PRIV, registerEditorAddon, registerProtectedAccessResolver,
  useBuildUrl, useCurrentUser, useHasPriv, useI18n, useUiContext,
} from '@hydrooj/ui-next';
import { Card, Stack, Text } from '@mantine/core';
import { IconPlayerPlay } from '@tabler/icons-react';
import { replayAccessRequest } from './access';
import { CodeReplay } from './components/record/code-replay';
import { createRecorder } from './recorder';

function ReplayAction({ record }: any) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const ui = useUiContext();
  const canRead = useHasPriv(PRIV.PRIV_READ_RECORD_CODE);
  const url = ui.codeReplayUrl;
  if (!url || (!canRead && record.uid !== user._id)) return null;
  return <Button component="a" href={url} size="xs" variant="light">{t('Code Replay')}</Button>;
}

function ReplayRowAction({ record }: any) {
  const { t } = useI18n();
  const user = useCurrentUser();
  const buildUrl = useBuildUrl();
  const canRead = useHasPriv(PRIV.PRIV_READ_RECORD_CODE);
  if (!canRead && record.uid !== user._id) return null;
  return <Button
    component={Link}
    href={buildUrl('code_replay', { rid: record._id })}
    size="compact-xs"
    variant="light"
    leftSection={<IconPlayerPlay size={14} />}
    style={{ whiteSpace: 'nowrap' }}>
    {t('Code Replay')}
  </Button>;
}

function InlineReplay({ record }: any) {
  const { t } = useI18n();
  if (!record.replay?.length) return null;
  return <Card withBorder p="lg" className="hydro-content-card"><Stack gap="sm">
    <Text size="sm" fw={700}>{t('Code Replay')}</Text>
    <CodeReplay key={String(record._id)} events={record.replay} initialCode="" language={record.lang} />
  </Stack></Card>;
}

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  api.registerPage('code_replay', () => import('./pages/code_replay'), { title: 'Code Replay', nav: 'record_main' });
  const cleanups = [
    registerEditorAddon('code-replay', createRecorder),
    registerProtectedAccessResolver(replayAccessRequest),
    api.after('component:record-action-extras', ReplayAction),
    api.after('component:record-content-extras', InlineReplay),
    api.after('component:record-row-action-extras', ReplayRowAction),
  ];
  return () => { cleanups.reverse().forEach((dispose) => dispose()); };
}
