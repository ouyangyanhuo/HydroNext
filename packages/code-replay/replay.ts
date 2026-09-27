export interface ReplayEvent {
    seq?: number;
    t?: number;
    timestamp?: number;
    lang?: string;
    selections?: unknown[];
    changes?: { rangeOffset: number, rangeLength: number, text: string, range?: unknown }[];
    type?: 'insert' | 'delete' | 'replace';
    position?: number;
    length?: number;
    text?: string;
}

export interface ReplaySnapshot {
    t: number;
    /** Code AFTER this event, not before it. Zero denotes the initial state. */
    afterSeq?: number;
    code: string;
    lang?: string;
}

export function eventTime(event: ReplayEvent) {
    return Math.max(0, Number(event.t ?? event.timestamp ?? 0) || 0);
}

export function applyEvent(code: string, event: ReplayEvent) {
    const changes = event.changes || (event.type ? [{
        rangeOffset: event.position ?? 0,
        rangeLength: event.type === 'insert' ? 0 : event.length ?? (event.type === 'delete' ? 1 : 0),
        text: event.type === 'delete' ? '' : event.text || '',
    }] : []);
    let next = code;
    for (const change of [...changes].sort((a, b) => b.rangeOffset - a.rangeOffset)) {
        // Monaco offsets refer to the same pre-edit UTF-16 string. Never clamp
        // invalid offsets: that invents characters at unrelated positions.
        if (!Number.isSafeInteger(change.rangeOffset) || !Number.isSafeInteger(change.rangeLength)
            || change.rangeOffset < 0 || change.rangeLength < 0
            || change.rangeOffset + change.rangeLength > code.length) return code;
        next = next.slice(0, change.rangeOffset) + change.text + next.slice(change.rangeOffset + change.rangeLength);
    }
    return next;
}

export function captureReplayChanges(previousCode: string, currentCode: string, changes: NonNullable<ReplayEvent['changes']>) {
    const deltas = changes.map(({ rangeOffset, rangeLength, text }) => ({ rangeOffset, rangeLength, text }));
    // EOL changes/model resets do not always have ordinary edit deltas.
    // Keep one exact replacement rather than recording offsets for another model.
    return applyEvent(previousCode, { changes: deltas }) === currentCode ? deltas
        : [{ rangeOffset: 0, rangeLength: previousCode.length, text: currentCode }];
}

export function buildReplayStates(events: ReplayEvent[], snapshots: ReplaySnapshot[], initialCode: string, finalCode?: string) {
    const sequenced = events.length > 0 && events.every((event) => Number.isSafeInteger(event.seq));
    const seen = new Set<number>();
    const ordered = [...events].sort((a, b) => sequenced ? a.seq! - b.seq! : eventTime(a) - eventTime(b))
        .filter((event) => {
            if (!sequenced) return true;
            if (seen.has(event.seq!)) return false;
            seen.add(event.seq!);
            return true;
        });
    // Attach snapshots to the state AFTER its event. Millisecond timestamps
    // alone cannot distinguish multiple edits: legacy snapshots must not replace
    // valid intermediate states (the final submitted code remains a fallback).
    const checkpoints = new Map<number, ReplaySnapshot>();
    for (const snapshot of snapshots) {
        if (ordered.length && (!sequenced || snapshot.afterSeq === undefined)) continue;
        let low = 0;
        let high = ordered.length;
        while (low < high) {
            const mid = (low + high) >>> 1;
            const before = sequenced && snapshot.afterSeq !== undefined
                ? ordered[mid].seq! <= snapshot.afterSeq : eventTime(ordered[mid]) <= snapshot.t;
            if (before) low = mid + 1;
            else high = mid;
        }
        // Initial snapshots must not overwrite an edit captured at t=0.
        const index = snapshot.afterSeq === 0 ? 0 : low;
        checkpoints.set(index, snapshot);
    }
    const states = [checkpoints.get(0)?.code ?? initialCode];
    const times = [0];
    for (let i = 0; i < ordered.length; i++) {
        states.push(checkpoints.get(i + 1)?.code ?? applyEvent(states[i], ordered[i]));
        times.push(Math.max(times[i], eventTime(ordered[i])));
    }
    if (typeof finalCode === 'string' && finalCode !== states[states.length - 1]) {
        states.push(finalCode);
        times.push(times[times.length - 1]);
    }
    return { states, times, events: ordered };
}

/** Keep both arrays below the server limits without silently losing edits. */
export function* replayBatches<T, S>(events: T[], snapshots: S[]) {
    for (let offset = 0; offset < Math.max(events.length, snapshots.length * 10); offset += 200) {
        yield { events: events.slice(offset, offset + 200), snapshots: snapshots.slice(offset / 10, offset / 10 + 20) };
    }
}
