# Proof Cases

These are the failure modes `rrule-kit` is designed to prevent. The repo test suite covers them in `test/index.test.ts` and `test/agent.test.ts`.

Run:

```bash
npm test
```

Current result: 12 tests passing.

## 1. Local 9 AM Stays Local 9 AM Through DST

The common bug: `9 AM` is treated as `9 AM UTC`, so users in Chicago get a 3-4 AM job depending on DST.

`rrule-kit` expands in the target IANA timezone, then exposes the UTC instant separately.

Test coverage: `test/index.test.ts`, `"handles DST transitions correctly"`

Expected behavior across US spring-forward in 2026:

| Date | Local Time | UTC Time |
|---|---:|---:|
| Before DST | `09:00 America/Chicago` | `15:00Z` |
| After DST | `09:00 America/Chicago` | `14:00Z` |

The local promise stays stable. The UTC instant shifts because the offset changed.

## 2. Same RRULE, Different Timezones, Different UTC Instants

The common bug: a single UTC cron expression is reused for everyone, so users in different timezones do not get the same wall-clock behavior.

Test coverage: `test/index.test.ts`, `"works across different timezones for same RRULE"`

Expected behavior:

- `FREQ=DAILY;BYHOUR=9` in `America/Chicago` returns local `09:00`.
- `FREQ=DAILY;BYHOUR=9` in `Asia/Tokyo` returns local `09:00`.
- The UTC instants are different.

## 3. Agent Jobs Do Not Double-Fire After Restart

The common bug: a scheduler restarts inside the due window and fires the same occurrence twice.

`rrule-kit/agent` persists occurrence-level dedup state to disk.

Test coverage: `test/agent.test.ts`, `"survives simulated restart"`

Expected behavior:

- First scheduler instance fires the due occurrence.
- Dedup state is written to disk.
- Second scheduler instance starts with the same dedup file.
- The same occurrence is not fired again.

## 4. Tight Tick Loops Do Not Double-Fire The Same Occurrence

The common bug: a 60-second polling loop observes the same due occurrence more than once inside the due window.

Test coverage: `test/agent.test.ts`, `"persists dedup state to disk"`

Expected behavior:

- First tick fires.
- Second tick sees the same due occurrence.
- Dedup suppresses the duplicate.

## What This Does Not Claim

- It does not replace every cron library.
- It does not solve distributed locking across multiple machines.
- It does not make ambiguous local times disappear. It makes occurrence handling explicit and testable.

For a production-specific review, see the fixed-scope [timezone scheduler audit](AUDIT.md).
