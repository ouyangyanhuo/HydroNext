import { applyEvent, type ReplayEvent } from './replay';

/** Validate and freeze a prefix without trusting snapshots to fill missing edits. */
export function continuousPrefix(events: ReplayEvent[], endSeq: number, initialCode: string, finalCode: string) {
    if (!Number.isSafeInteger(endSeq) || endSeq < 0) throw new Error('Invalid replay checkpoint');
    const bySequence = new Map<number, ReplayEvent>();
    for (const event of events) {
        if (!Number.isSafeInteger(event.seq) || event.seq! <= 0) throw new Error('Invalid replay sequence');
        if (event.seq! > endSeq) continue;
        const previous = bySequence.get(event.seq!);
        if (previous && JSON.stringify(previous) !== JSON.stringify(event)) throw new Error('Conflicting replay event');
        bySequence.set(event.seq!, event);
    }
    if (bySequence.size !== endSeq) throw new Error('Incomplete replay upload');
    const ordered: ReplayEvent[] = [];
    let code = initialCode;
    let time = 0;
    for (let seq = 1; seq <= endSeq; seq++) {
        const event = bySequence.get(seq);
        if (!event || !Number.isFinite(event.t) || event.t! < time || !event.changes?.length) throw new Error('Invalid replay event');
        for (const change of event.changes) {
            if (!Number.isSafeInteger(change.rangeOffset) || !Number.isSafeInteger(change.rangeLength)
                || change.rangeOffset < 0 || change.rangeLength < 0 || change.rangeOffset + change.rangeLength > code.length) {
                throw new Error('Invalid replay range');
            }
        }
        code = applyEvent(code, event);
        time = event.t!;
        ordered.push(event);
    }
    if (code !== finalCode) throw new Error('Replay does not match submitted code');
    return ordered;
}
