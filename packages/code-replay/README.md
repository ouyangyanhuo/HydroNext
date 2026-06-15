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
