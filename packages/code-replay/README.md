# Hydro Code Replay

Code Replay records Scratchpad editing events and binds the captured session to the next formal judge submission.
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
session ID without its event history. ui-next also uses a fresh upload ID when
retrying a submission, so a partially accepted upload cannot duplicate edits.

Legacy timestamp-only recordings remain playable, but their periodic snapshots
are not interleaved with edits: timestamps do not identify whether a snapshot is
before or after another edit in the same millisecond. Previously discarded edits
(for example, past the old 500-event upload limit) cannot be recovered; the final
submitted code is still shown as a fallback.

Unsubmitted sessions expire after seven days. Sessions bound to a submission record are retained.

## Routes

- `POST /code-replay/session`: append capture data for the current user.
- `GET /record/:rid/replay`: replay page.
- `GET /record/:rid/replay/data`: replay payload.

## Manual Check

1. Enable the addon and rebuild/restart Hydro so frontend entries are regenerated.
2. Open a problem detail page and enter Scratchpad.
3. Type code, submit with the Scratchpad submit button, then open the generated record.
4. Confirm a `Code Replay` button appears next to the code download button.
5. Open the replay and verify play, pause, step, speed, and timeline controls.

The plugin uses Hydro route generation for its capture and replay URLs, including `/d/:domainId/` path-domain deployments.
