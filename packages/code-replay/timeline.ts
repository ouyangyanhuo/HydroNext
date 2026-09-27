export const THINKING_THRESHOLD_MS = 5000;

export interface ThinkingRange {
    start: number;
    end: number;
}

/** The entire gap is idle if no edit occurred for at least five seconds. */
export function buildThinkingRanges(times: number[], duration: number): ThinkingRange[] {
    const ranges: ThinkingRange[] = [];
    let previous = 0;
    for (const value of times) {
        if (!Number.isFinite(value)) continue;
        const next = Math.max(previous, Math.min(duration, value));
        if (next - previous >= THINKING_THRESHOLD_MS) ranges.push({ start: previous, end: next });
        previous = next;
    }
    if (duration - previous >= THINKING_THRESHOLD_MS) ranges.push({ start: previous, end: duration });
    return ranges;
}

/** Latest code state at this time, including all edits with the same timestamp. */
export function replayIndexAtTime(times: number[], time: number) {
    let low = 0;
    let high = times.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (times[mid] <= time) low = mid + 1;
        else high = mid;
    }
    return Math.max(0, low - 1);
}

function firstRangeAfter(ranges: ThinkingRange[], time: number) {
    let low = 0;
    let high = ranges.length;
    while (low < high) {
        const mid = (low + high) >>> 1;
        if (ranges[mid].end <= time) low = mid + 1;
        else high = mid;
    }
    return low;
}

export function thinkingRangeAt(ranges: ThinkingRange[], time: number) {
    const range = ranges[firstRangeAfter(ranges, time)];
    return range && range.start <= time ? range : undefined;
}

/** Consume elapsed playback time only in active regions when skipping is enabled. */
export function advanceReplayTime(time: number, elapsed: number, duration: number, ranges: ThinkingRange[], skip: boolean) {
    let target = time + Math.max(0, elapsed);
    if (skip) {
        for (let i = firstRangeAfter(ranges, time); i < ranges.length && ranges[i].start <= target; i++) {
            target += ranges[i].end - Math.max(time, ranges[i].start);
        }
    }
    return Math.max(0, Math.min(duration, target));
}
