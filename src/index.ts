/**
 * rrule-kit — Timezone-correct RRULE scheduling.
 *
 * Drop-in replacement for the `rrule` package that actually handles timezones.
 * Built on rrule-temporal (RFC 5545 compliant, TC39 Temporal API).
 *
 * The `rrule` npm package (800K weekly downloads) returns "fake UTC" dates
 * that silently fire at wrong times across timezones. This library fixes that.
 */

import { RRuleTemporal } from "rrule-temporal";
import { Temporal } from "@js-temporal/polyfill";

export type { Temporal };
export { RRuleTemporal };

/** Options for creating a timezone-aware RRULE */
export interface RRuleOptions {
  /** IANA timezone identifier (e.g. "America/Chicago", "Europe/London") */
  timezone: string;
  /** RRULE string — just the recurrence parts (e.g. "FREQ=DAILY;BYHOUR=9") */
  rrule: string;
  /** DTSTART as ISO string or Date. Defaults to start of today in the given timezone. */
  dtstart?: string | Date;
}

/** A single occurrence with both local and UTC representations */
export interface Occurrence {
  /** Wall-clock time in the specified timezone (e.g. "2026-03-25T09:00:00") */
  local: string;
  /** UTC instant (e.g. "2026-03-25T14:00:00Z") */
  utc: string;
  /** Unix timestamp in milliseconds */
  epochMs: number;
  /** IANA timezone used */
  timezone: string;
}

/** Parse RRULE parts string into ManualOpts for RRuleTemporal */
function parseRRuleParts(rruleStr: string): Record<string, unknown> {
  const parts = rruleStr.replace(/^RRULE:/, "").split(";");
  const opts: Record<string, unknown> = {};

  for (const part of parts) {
    const [key, val] = part.split("=");
    switch (key) {
      case "FREQ": opts.freq = val; break;
      case "INTERVAL": opts.interval = parseInt(val); break;
      case "COUNT": opts.count = parseInt(val); break;
      case "BYHOUR": opts.byHour = val.split(",").map(Number); break;
      case "BYMINUTE": opts.byMinute = val.split(",").map(Number); break;
      case "BYSECOND": opts.bySecond = val.split(",").map(Number); break;
      case "BYDAY": opts.byDay = val.split(","); break;
      case "BYMONTH": opts.byMonth = val.split(",").map(Number); break;
      case "BYMONTHDAY": opts.byMonthDay = val.split(",").map(Number); break;
      case "BYYEARDAY": opts.byYearDay = val.split(",").map(Number); break;
      case "BYWEEKNO": opts.byWeekNo = val.split(",").map(Number); break;
      case "BYSETPOS": opts.bySetPos = val.split(",").map(Number); break;
      case "WKST": opts.wkst = val; break;
    }
  }

  return opts;
}

/**
 * Parse an RRULE string into a timezone-aware rule.
 * Returns a helper with methods to query occurrences.
 */
export function createRule(opts: RRuleOptions) {
  const tz = opts.timezone;
  const parsed = parseRRuleParts(opts.rrule);

  let dtstart: Temporal.ZonedDateTime;
  if (opts.dtstart) {
    const d = opts.dtstart instanceof Date ? opts.dtstart : new Date(opts.dtstart);
    const instant = Temporal.Instant.fromEpochMilliseconds(d.getTime());
    dtstart = instant.toZonedDateTimeISO(tz);
  } else {
    // Default: start of today in the given timezone
    const now = Temporal.Now.zonedDateTimeISO(tz);
    dtstart = now.startOfDay();
  }

  const rule = new RRuleTemporal({
    ...parsed,
    tzid: tz,
    dtstart,
  } as any);

  function toOccurrence(zdt: Temporal.ZonedDateTime): Occurrence {
    return {
      local: zdt.toPlainDateTime().toString(),
      utc: zdt.toInstant().toString(),
      epochMs: zdt.epochMilliseconds,
      timezone: tz,
    };
  }

  return {
    /** Get the next N occurrences from now (or from a given date) */
    next(count: number, after?: Date): Occurrence[] {
      const afterZdt = after
        ? Temporal.Instant.fromEpochMilliseconds(after.getTime()).toZonedDateTimeISO(tz)
        : Temporal.Now.zonedDateTimeISO(tz);

      // Use between with a far-future end to get next N
      const farFuture = afterZdt.add({ years: 2 });
      const all = rule.between(afterZdt, farFuture);
      return all.slice(0, count).map(toOccurrence);
    },

    /** Get all occurrences between two dates */
    between(start: Date, end: Date): Occurrence[] {
      const s = Temporal.Instant.fromEpochMilliseconds(start.getTime()).toZonedDateTimeISO(tz);
      const e = Temporal.Instant.fromEpochMilliseconds(end.getTime()).toZonedDateTimeISO(tz);
      return rule.between(s, e).map(toOccurrence);
    },

    /** Check if the rule is due within a time window (useful for 60s tick loops) */
    isDue(windowMs = 90_000): { due: boolean; occurrence?: Occurrence } {
      const now = Date.now();
      const windowStart = new Date(now - windowMs);
      const windowEnd = new Date(now);
      const hits = this.between(windowStart, windowEnd);
      return hits.length > 0
        ? { due: true, occurrence: hits[0] }
        : { due: false };
    },

    /** Get the underlying RRuleTemporal instance */
    raw: rule,
  };
}

/**
 * Convenience: get next N occurrences for an RRULE in a timezone.
 *
 * @example
 * ```ts
 * const times = nextOccurrences("FREQ=DAILY;BYHOUR=9", "America/Chicago", 5);
 * // Returns 5 occurrences at 9:00 AM Central, DST-correct
 * ```
 */
export function nextOccurrences(
  rrule: string,
  timezone: string,
  count: number,
  after?: Date,
): Occurrence[] {
  return createRule({ rrule, timezone }).next(count, after);
}

/**
 * Convenience: check if an RRULE is due right now in a timezone.
 *
 * @example
 * ```ts
 * const { due } = isDue("FREQ=DAILY;BYHOUR=9", "America/Chicago");
 * if (due) sendMessage();
 * ```
 */
export function isDue(
  rrule: string,
  timezone: string,
  windowMs = 90_000,
): { due: boolean; occurrence?: Occurrence } {
  return createRule({ rrule, timezone }).isDue(windowMs);
}

/**
 * Detect the system's IANA timezone.
 */
export function detectTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}
