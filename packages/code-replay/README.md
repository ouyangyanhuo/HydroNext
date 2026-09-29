# Hydro Code Replay

Code Replay records Scratchpad editing events and associates them with formal judge submissions.
Users with the same permission required to view the submitted code can open the replay from the record detail page.

## Scope

- Captures Hydro Scratchpad pages:
  - `problem_detail`
  - `contest_detail_problem`
  - `homework_detail_problem`
- Does not capture the legacy submit textarea page.
- Pretest runs are ignored.

## Data

The plugin stores replay metadata in `code_replay` and replay event chunks in `code_replay_chunk`:

- initial code
- Monaco edit deltas
- periodic snapshots
- final submitted code
- bound submission record id

Both ui-default and ui-next use the shared `replay.ts` playback implementation.
New recordings carry monotonically increasing event sequence numbers; snapshots
identify the event they follow (`afterSeq`). Uploads are split into batches of
200 events / 20 snapshots. A fresh editing timeline never reuses a persisted
session ID without its event history.

### Continuous recordings in ui-next (protocol v2)

- Editing continues across self-tests and formal submissions. A self-test does
  not upload, bind, or reset the recording.
- IndexedDB stores new deltas and their metadata atomically, scoped by user,
  domain, problem, contest, and browser tab. The editor restores this state
  before accepting input; unavailable storage produces a warning rather than
  silently claiming that refresh recovery is available.
- Submission first commits the local prefix, queries the uploaded sequence,
  and uploads only missing events. Batches are content-addressed and immutable,
  so retrying an accepted upload does not duplicate it.
- Each formal submission binds a separate checkpoint containing the source
  session, cutoff sequence, final snapshot, and frozen chunk IDs. Later edits
  cannot modify an older submission's replay. Missing/conflicting deltas and
  mismatching final code are rejected before submission.
- Upload failures keep the recording and stop the formal submit with a retry
  message. If judging submission succeeds but binding fails, the response
  reports this separately; the local recording is retained.
- Update ui-next and the backend addon together. Existing ui-default and legacy
  recordings keep their original protocol; no MongoDB version upgrade or data
  migration is required. Historical events already lost cannot be reconstructed.

Legacy timestamp-only recordings remain playable, but their periodic snapshots
are not interleaved with edits: timestamps do not identify whether a snapshot is
before or after another edit in the same millisecond. Previously discarded edits
(for example, past the old 500-event upload limit) cannot be recovered; the final
submitted code is still shown as a fallback.

## Thinking time (ui-next)

The timeline uses elapsed time, not the number of editing events. Gaps of at
least five seconds without an edit are shown as blank, outlined regions; this is
an idle-time heuristic, not a measurement of the user's actual thought process.
The optional **Skip thinking time** switch jumps across these regions while
keeping the selected speed in active regions. Manual seeking and single-step
controls still work with skipping enabled. The last submission snapshot retains
the idle tail after the last edit. New ui-next sessions start when the editor is
mounted, so the pause before the first edit can also be recorded. Older recordings
cannot recover any time that was never captured.

Unsubmitted sessions expire after seven days. Sessions bound to a submission record are retained.

## Routes

- `POST /code-replay/session`: append legacy data; with `replayVersion: 2`,
  use `action: status`, `append`, or `checkpoint` for continuous recordings.
- `GET /record/:rid/replay`: replay page.
- `GET /record/:rid/replay/data`: replay payload.

## Manual Check

1. Enable the addon and rebuild/restart Hydro so frontend entries are regenerated.
2. Open a problem detail page and enter Scratchpad.
3. Type code, submit with the Scratchpad submit button, then open the generated record.
4. Confirm a `Code Replay` button appears next to the code download button.
5. Open the replay and verify play, pause, step, speed, and timeline controls.
6. In ui-next, edit, run several self-tests, refresh, and formally submit. Check
   that edits from before the self-tests remain visible.
7. Return to the same editor, edit and submit again. The second replay includes
   the earlier prefix; the first replay still ends at its original checkpoint.

The plugin uses Hydro route generation for its capture and replay URLs, including `/d/:domainId/` path-domain deployments.
