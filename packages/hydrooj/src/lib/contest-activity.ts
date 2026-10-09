import type { ContestStatusDoc, ScoreboardRow, Tdoc } from '../interface';

export const ACTIVITY_LEASE_MS = 30_000;

export function contestActivityBounds(tdoc: Tdoc, status: ContestStatusDoc) {
    const begin = tdoc.duration && !status.startAt ? Infinity : Math.max(tdoc.beginAt.getTime(), status.startAt?.getTime() || 0);
    const end = Math.min(
        tdoc.endAt.getTime(), status.endAt?.getTime() ?? Infinity,
        tdoc.duration ? (status.startAt?.getTime() ?? Infinity) + tdoc.duration * 3_600_000 : Infinity,
    );
    return { begin, end };
}

export function advanceContestActivity(
    previous: ContestStatusDoc['problemActivity'], token: string, pid: number, active: boolean,
    now: number, bounds: { begin: number, end: number },
) {
    // A late close/hidden event from an old tab cannot stop the current tab's lease.
    if (!active && previous && previous.token !== token) return null;
    const at = Math.max(previous?.at || 0, now);
    const elapsed = previous && at - previous.at <= ACTIVITY_LEASE_MS
        ? Math.max(0, Math.min(at, bounds.end) - Math.max(previous.at, bounds.begin)) : 0;
    return {
        elapsed, countedPid: previous?.pid,
        activity: active && at >= bounds.begin && at < bounds.end ? { token, pid, at } : null,
    };
}

export function formatProblemTime(milliseconds: number) {
    const seconds = Math.floor(Math.max(0, milliseconds) / 1000);
    return [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60]
        .map((value) => String(value).padStart(2, '0')).join(':');
}

export function appendContestActivityTimes(
    rows: ScoreboardRow[], times: Pick<ContestStatusDoc, 'uid' | 'problemTimes' | 'totalProblemTime'>[],
    pids: number[], isExport: boolean, translate: (key: string) => string,
) {
    if (!rows.length) return;
    const header = rows[0];
    const byUser = new Map(times.map((status) => [status.uid, status]));
    const userIndex = header.findIndex((column) => column.type === 'user');
    const insertAt = isExport ? header.length : userIndex + 1;
    const columns = [{ type: 'time' as const, value: translate('Total problem time') }];
    if (isExport) for (const pid of pids) columns.push({ type: 'time', value: `P${pid} ${translate('Time on this problem')}` });
    for (const row of rows.slice(1)) {
        const status = byUser.get(Number(row.find((cell) => cell.type === 'user')?.raw));
        if (!isExport) {
            for (const [index, column] of header.entries()) {
                if (column.type === 'problem' && column.raw && row[index]) row[index].problemTime = status?.problemTimes?.[Number(column.raw)];
            }
        }
        const values = [status?.totalProblemTime, ...(isExport ? pids.map((pid) => status?.problemTimes?.[pid]) : [])];
        row.splice(insertAt, 0, ...values.map((value) => ({ type: 'time' as const, value: value === undefined ? '—' : formatProblemTime(value) })));
    }
    header.splice(insertAt, 0, ...columns);
}
