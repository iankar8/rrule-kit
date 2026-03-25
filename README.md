# rrule-kit

Timezone-correct RRULE scheduling for AI agents.

The [`rrule`](https://github.com/jakubroztocil/rrule) npm package gets 800K weekly downloads and has 211 open issues — **half of them are timezone bugs**. It returns "fake UTC" dates that silently fire your schedules at the wrong time. The library hasn't shipped a release since July 2022.

Every AI agent framework inherits this problem. Claude Code, OpenClaw, Prefect, n8n — all have documented bugs where agents wake up at 3am instead of 9am. [Jon Skeet called this out in 2019](https://codeblog.jonskeet.uk/2019/03/27/storing-utc-is-not-a-silver-bullet/): recurring events are the one case where storing UTC breaks down.

`rrule-kit` fixes this with two entry points:

1. **`rrule-kit`** — A timezone-aware RRULE library that returns correct wall-clock times through DST transitions
2. **`rrule-kit/agent`** — A scheduling primitive for AI agents with persisted dedup, process restart survival, and single-fire guarantees

Built on [rrule-temporal](https://github.com/ggaabe/rrule-temporal) (RFC 5545 compliant, TC39 Temporal API).

## Install

```bash
npm install rrule-kit
```

## The Problem

```js
// Using the `rrule` package (800K weekly downloads)
import { RRule } from 'rrule'

const rule = new RRule({
  freq: RRule.DAILY,
  byhour: [9],
  byminute: [0],
})

// "9am" fires at 9:00 UTC = 4am EST = 2am PST
// Your agent wakes up at 2am. Your users get messages at 4am.
// 106 open issues about this. No fix coming.
```

## The Fix

```ts
import { nextOccurrences } from 'rrule-kit'

const times = nextOccurrences('FREQ=DAILY;BYHOUR=9', 'America/Chicago', 5)
// 9:00 AM Central, every day, correct through DST transitions
// times[0].local = "2026-03-25T09:00:00"
// times[0].utc   = "2026-03-25T14:00:00Z"  (CDT, UTC-5)
// After fall-back:
// times[N].utc   = "2026-11-02T15:00:00Z"  (CST, UTC-6)
// Local time stays 9:00 AM. UTC shifts automatically.
```

## API

### Core (`rrule-kit`)

#### `nextOccurrences(rrule, timezone, count, after?)`

Get the next N occurrences of an RRULE in a timezone.

```ts
import { nextOccurrences } from 'rrule-kit'

const times = nextOccurrences(
  'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9',
  'America/New_York',
  3
)
// Every Monday at 9am Eastern
```

#### `isDue(rrule, timezone, windowMs?)`

Check if an RRULE is due right now. Designed for 60-second tick loops.

```ts
import { isDue } from 'rrule-kit'

const { due, occurrence } = isDue(
  'FREQ=DAILY;BYHOUR=9',
  'America/Chicago',
  90_000  // 90 second window (default)
)
if (due) {
  console.log(`Firing at ${occurrence.local}`)
}
```

#### `createRule(opts)`

Create a rule with full control over DTSTART and query methods.

```ts
import { createRule } from 'rrule-kit'

const rule = createRule({
  rrule: 'FREQ=MONTHLY;BYMONTHDAY=15;BYHOUR=9',
  timezone: 'Europe/London',
  dtstart: new Date('2026-01-01'),
})

const next = rule.next(3)
const range = rule.between(startDate, endDate)
const { due } = rule.isDue()
```

#### `detectTimezone()`

Returns the system's IANA timezone string.

```ts
import { detectTimezone } from 'rrule-kit'
console.log(detectTimezone()) // "America/Chicago"
```

### Agent Scheduler (`rrule-kit/agent`)

A complete scheduling primitive for AI agents that solves three problems at once:

1. **Timezone** — Fires at correct wall-clock time
2. **Dedup** — Persisted to disk, survives process restarts
3. **Single-fire** — One execution per occurrence, even with multiple processes

```ts
import { createScheduler } from 'rrule-kit/agent'

const scheduler = createScheduler({
  // Optional: custom dedup file path (default: ~/.rrule-kit/dedup.json)
  dedupPath: '/path/to/dedup.json',
  // Optional: tick interval (default: 60s)
  tickIntervalMs: 60_000,
  // Optional: default timezone (default: system timezone)
  defaultTimezone: 'America/Chicago',
})

scheduler.add({
  id: 'morning-briefing',
  rrule: 'FREQ=DAILY;BYHOUR=9;BYMINUTE=0',
  timezone: 'America/Chicago',
  handler: async (occurrence) => {
    await sendTelegram(`Good morning! It's ${occurrence.local}`)
  },
})

scheduler.add({
  id: 'weekly-review',
  rrule: 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9',
  timezone: 'America/Chicago',
  handler: async () => {
    await generateWeeklyReport()
  },
})

// Start the 60-second tick loop
scheduler.start()

// On shutdown
process.on('SIGTERM', () => scheduler.stop())
```

#### Scheduler Methods

| Method | Description |
|--------|-------------|
| `add(task)` | Register a scheduled task |
| `remove(id)` | Remove a task and clear its dedup state |
| `start()` | Start the tick loop |
| `stop()` | Stop the tick loop |
| `tick()` | Manually trigger a tick (for testing) |
| `isDue(id)` | Check if a task is due without firing it |
| `nextOccurrences(id, count)` | Preview upcoming occurrences |
| `list()` | List all registered task IDs |
| `dedupState()` | Inspect dedup state (for debugging) |

## Occurrence Object

Every occurrence includes both local and UTC representations:

```ts
interface Occurrence {
  local: string    // "2026-03-25T09:00:00" (wall-clock time)
  utc: string      // "2026-03-25T14:00:00Z" (UTC instant)
  epochMs: number  // 1774634400000
  timezone: string // "America/Chicago"
}
```

## Why Not Just Use Cron?

Cron expressions describe fixed intervals relative to system time. RRULE describes calendar semantics — "every Monday at 9am" should mean 9am local through DST transitions. This requires maintaining timezone context throughout expansion, which cron doesn't do.

RRULE also supports patterns cron can't express: "the 15th of every month", "every other Wednesday", "the last Friday of each quarter."

## Who Has This Bug?

Not a theoretical problem. Documented in production across the ecosystem:

- **`rrule` npm package** — [106 open timezone issues](https://github.com/jakubroztocil/rrule/issues?q=is%3Aopen+timezone+OR+UTC+OR+TZID), [#336](https://github.com/jkbrzt/rrule/issues/336) has 57+ comments, [#38](https://github.com/jkbrzt/rrule/issues/38) is from 2013
- **Claude Code** — [#33586](https://github.com/anthropics/claude-code/issues/33586): tasks skipped silently due to timezone mismatch
- **OpenClaw** — [#30351](https://github.com/openclaw/openclaw/issues/30351): scheduler calculates wrong year
- **Prefect** — [#9995](https://github.com/PrefectHQ/prefect/issues/9995): RRULE caused cascading duplicate runs
- **n8n** — [Multiple](https://community.n8n.io/t/schedule-trigger-executing-at-wrong-time/20994) community reports of wrong execution times
- **Kubernetes** — [#78795](https://github.com/kubernetes/kubernetes/issues/78795): cronjob always uses UTC
- **FullCalendar** — [#6815](https://github.com/fullcalendar/fullcalendar/issues/6815): rrule events on wrong day with timezone

## Credits

Built on [rrule-temporal](https://github.com/ggaabe/rrule-temporal) by Gabe Rosenberg — the first fully RFC 5545 compliant RRULE library in JavaScript, using the TC39 Temporal API.

## License

MIT
