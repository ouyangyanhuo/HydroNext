import type { EditorAddon, EditorAddonContext } from '@hydrooj/ui-next';
import { notifications } from '@mantine/notifications';
import { REPLAY_ACTIONS, type ReplayAction } from '../replay';
import {
  continueRecording, recordAction, recordCode, recordingCheckpoint, type ReplayRecording, uploadRecordingCheckpoint,
} from './components/editor/replay-recording';
import { memoryRecording, persistRecording, replaceRecording, replayDraftKey, restoreRecording } from './components/editor/replay-storage';

export function createRecorder(context: EditorAddonContext): EditorAddon | null {
  const url = context.ui.editorAddons?.['code-replay']?.sessionUrl;
  if (!url || !context.userId) return null;
  const storageKey = replayDraftKey(`code-replay/${context.userId}/${context.domainId}/${context.pid}${context.tid ? `@${context.tid}` : ''}`);
  let recording: ReplayRecording | undefined;
  let warned = false;
  const warn = () => {
    if (warned) return;
    warned = true;
    notifications.show({ color: 'yellow', message: context.translate('Replay could not be saved locally. Keep this editor open until submission.') });
  };
  const save = () => { if (recording) void persistRecording(storageKey, recording).catch(warn); };
  return {
    async initialize(code, signal) {
      let restored: ReplayRecording;
      try { restored = await restoreRecording(storageKey, code); } catch {
        if (signal?.aborted) return code;
        restored = memoryRecording(storageKey, code);
        warn();
      }
      if (signal?.aborted) return code;
      recording = restored;
      save();
      return recording.currentCode;
    },
    capture(code, lang) {
      if (!recording) return;
      recordCode(recording, code, lang);
      save();
    },
    action(action, lang, characters) {
      if (!recording || !REPLAY_ACTIONS.includes(action as ReplayAction)) return;
      recordAction(recording, action as ReplayAction, lang, characters);
      save();
    },
    change(previousCode, code, lang, changes, selections) {
      if (!recording) return;
      recordCode(recording, previousCode, lang);
      if (recordCode(recording, code, lang, changes)) recording.events[recording.events.length - 1].selections = selections;
      save();
    },
    async beforeSubmit(code, lang) {
      if (!recording) throw new Error('Replay is not ready');
      recordCode(recording, code, lang);
      const current = recording;
      const checkpoint = recordingCheckpoint(current);
      await persistRecording(storageKey, current).catch(warn);
      let sessionId: string;
      try {
        sessionId = await uploadRecordingCheckpoint(checkpoint, async (payload) => {
          const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({ ...payload, pid: context.submitPid, tid: context.tid, lang }),
          });
          const data = await response.json();
          if (!response.ok || data.error) throw new Error(data.error?.message || 'Replay upload failed');
          return data;
        });
      } catch {
        throw new Error('Replay upload failed. Your recording is kept; please retry submission.');
      }
      return {
        fields: { codeReplaySessionId: sessionId },
        async complete(result) {
          if (result.codeReplayError) {
            notifications.show({
              color: 'yellow',
              message: context.translate('Submission succeeded, but replay could not be linked. Your recording is kept.'),
            });
          } else if (result.codeReplayCommitted && recording === current) {
            recording = continueRecording(current, checkpoint);
            await replaceRecording(storageKey, recording).catch(warn);
          }
        },
      };
    },
  };
}
