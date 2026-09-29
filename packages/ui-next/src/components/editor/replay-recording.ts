import { captureReplayChanges, type ReplayEvent } from '@hydrooj/code-replay/replay';

export interface ReplayRecording {
  version: 2;
  sessionId: string;
  initialCode: string;
  currentCode: string;
  startedAt: number;
  sequence: number;
  lastTime: number;
  events: ReplayEvent[];
}

export function newRecording(code: string, now = Date.now()): ReplayRecording {
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  return {
    version: 2, sessionId: Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(''),
    initialCode: code, currentCode: code, startedAt: now, sequence: 0, lastTime: 0, events: [],
  };
}

/** Reconcile cached code with a minimal edit, never an extra copy of the entire file. */
function difference(before: string, after: string) {
  let start = 0;
  while (start < before.length && start < after.length && before[start] === after[start]) start++;
  let end = 0;
  while (end < before.length - start && end < after.length - start
    && before[before.length - 1 - end] === after[after.length - 1 - end]) end++;
  return [{ rangeOffset: start, rangeLength: before.length - start - end, text: after.slice(start, after.length - end) }];
}

export function recordCode(recording: ReplayRecording, code: string, lang: string, changes?: ReplayEvent['changes'], now = Date.now()) {
  if (recording.currentCode === code) return false;
  const deltas = captureReplayChanges(recording.currentCode, code, changes ?? difference(recording.currentCode, code));
  recording.lastTime = Math.max(recording.lastTime, now - recording.startedAt, 0);
  recording.events.push({ seq: ++recording.sequence, t: recording.lastTime, changes: deltas, lang });
  recording.currentCode = code;
  return true;
}

/** Copies the event list so edits while requests are in flight belong to the next submission. */
export function recordingCheckpoint(recording: ReplayRecording, now = Date.now()) {
  recording.lastTime = Math.max(recording.lastTime, now - recording.startedAt, 0);
  return {
    sessionId: recording.sessionId, initialCode: recording.initialCode, finalCode: recording.currentCode,
    endSeq: recording.sequence, endTime: recording.lastTime,
    events: recording.events.slice(),
  };
}

export async function uploadRecordingCheckpoint(
  checkpoint: ReturnType<typeof recordingCheckpoint>,
  send: (payload: Record<string, unknown>) => Promise<any>,
) {
  const base = { replayVersion: 2, sessionId: checkpoint.sessionId, initialCode: checkpoint.initialCode };
  const status = await send({ ...base, action: 'status' });
  if (status.replayVersion !== 2 || !Number.isSafeInteger(status.uploadedSeq) || status.uploadedSeq < 0) {
    throw new Error('Replay server does not support continuous recordings');
  }
  for (let offset = Math.min(status.uploadedSeq, checkpoint.endSeq); offset < checkpoint.events.length; offset += 200) {
    await send({ ...base, action: 'append', events: checkpoint.events.slice(offset, offset + 200) });
  }
  const result = await send({
    ...base, action: 'checkpoint', endSeq: checkpoint.endSeq, endTime: checkpoint.endTime, finalCode: checkpoint.finalCode,
  });
  if (result.replayVersion !== 2 || typeof result.sessionId !== 'string' || !/^[a-zA-Z0-9_-]{16,80}$/.test(result.sessionId)) {
    throw new Error('Invalid replay checkpoint response');
  }
  return result.sessionId as string;
}
