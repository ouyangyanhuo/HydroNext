/* eslint-disable react-refresh/only-export-components -- Addon slot registration. */
import { formatContestClock, type PluginDefinition, useI18n, usePageData, useSessionStore } from '@hydrooj/ui-next';
import { Text } from '@mantine/core';
import { ContestAnnouncementComposer } from './components/contest-announcement-composer';
import { ContestAnnouncements } from './components/contest-announcements';
import { ContestProblemTimer } from './components/contest-problem-timer';

function Announcements() {
  const uid = useSessionStore((state) => state.user._id);
  return uid > 0 ? <ContestAnnouncements key={uid} /> : null;
}

function ProblemTimer({ deadline, title }: { deadline?: number, title: string }) {
  const { args } = usePageData();
  const user = useSessionStore((state) => state.user);
  const domainId = useSessionStore((state) => state.ui.domainId);
  const { tdoc, tsdoc, pdoc } = args;
  const tid = tdoc?.docId || tdoc?._id;
  if (!tid || !pdoc || deadline === undefined) return null;
  const storageKey = `hydro:contest-problem-time:v1:${JSON.stringify([
    domainId || pdoc.domainId, String(tid), user._id || 0, pdoc.docId || pdoc.pid,
  ])}`;
  return <ContestProblemTimer
    key={storageKey}
    storageKey={storageKey}
    tid={String(tid)}
    pid={Number(pdoc.docId)}
    title={title}
    beginAt={Math.max(new Date(tdoc.beginAt).getTime() || 0, new Date(tsdoc?.startAt).getTime() || 0)}
    endAt={deadline}
    recordTime={Boolean(tsdoc?.attend && args.mode === 'contest')}
  />;
}

function ManageActions({ data }: any) {
  return <ContestAnnouncementComposer enabled={!!data.canSendAnnouncement} />;
}

function ProblemTime({ cell, column }: any) {
  const { t } = useI18n();
  return column.type === 'problem' && cell.problemTime !== undefined ? (
    <Text size="xs" c="dimmed" title={t('Time on this problem')} style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {t('Time on this problem')} {formatContestClock(cell.problemTime)}
    </Text>
  ) : null;
}

export function setup(api: Parameters<PluginDefinition['setup']>[0]) {
  const dispose = [
    api.after('component:shell-overlays', Announcements),
    api.after('component:problem-page-extras', ProblemTimer),
    api.after('component:contest-manage-actions', ManageActions),
    api.after('component:scoreboard-cell-extras', ProblemTime),
  ];
  return () => dispose.forEach((remove) => remove());
}
