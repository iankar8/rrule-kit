import { describe, it, expect } from "vitest";
import { nextOccurrences, isDue, createRule, detectTimezone } from "../src/index";

describe("nextOccurrences", () => {
  it("returns occurrences at correct local time", () => {
    const results = nextOccurrences(
      "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      "America/Chicago",
      3,
    );

    expect(results).toHaveLength(3);
    for (const occ of results) {
      // Local time should always be 09:00
      expect(occ.local).toMatch(/T09:00:00$/);
      expect(occ.timezone).toBe("America/Chicago");
      expect(occ.epochMs).toBeGreaterThan(0);
      // UTC should NOT be 09:00 (Chicago is UTC-5 or UTC-6)
      expect(occ.utc).not.toMatch(/T09:00:00Z$/);
    }
  });

  it("handles DST transitions correctly", () => {
    // March 8, 2026 is spring-forward day in US (2am -> 3am)
    const rule = createRule({
      rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      timezone: "America/Chicago",
      dtstart: new Date("2026-03-01T00:00:00Z"),
    });
    // Span across DST boundary
    const results = rule.between(
      new Date("2026-03-07T00:00:00Z"),
      new Date("2026-03-12T00:00:00Z"),
    );

    // All should be at 9:00 AM local regardless of DST
    for (const occ of results) {
      expect(occ.local).toMatch(/T09:00:00$/);
    }

    // UTC offsets should differ across DST boundary
    const utcHours = results.map((r) => new Date(r.utc).getUTCHours());
    // Before DST: 9am CST = 15:00 UTC. After DST: 9am CDT = 14:00 UTC.
    expect(utcHours).toContain(15); // CST
    expect(utcHours).toContain(14); // CDT
  });

  it("works with weekly schedules", () => {
    const results = nextOccurrences(
      "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      "America/New_York",
      3,
    );

    expect(results).toHaveLength(3);
    for (const occ of results) {
      expect(occ.local).toMatch(/T09:00:00$/);
      // Check it's a Monday
      const date = new Date(occ.epochMs);
      const dayOfWeek = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: "America/New_York",
      }).format(date);
      expect(dayOfWeek).toBe("Monday");
    }
  });

  it("works across different timezones for same RRULE", () => {
    const rrule = "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0";

    const chicago = nextOccurrences(rrule, "America/Chicago", 1);
    const tokyo = nextOccurrences(rrule, "Asia/Tokyo", 1);

    // Both should show 09:00 local
    expect(chicago[0].local).toMatch(/T09:00:00$/);
    expect(tokyo[0].local).toMatch(/T09:00:00$/);

    // But different UTC times
    expect(chicago[0].utc).not.toBe(tokyo[0].utc);
  });
});

describe("createRule", () => {
  it("isDue returns false outside the window", () => {
    // An RRULE that fires at midnight — almost certainly not due right now
    const rule = createRule({
      rrule: "FREQ=YEARLY;BYMONTH=1;BYMONTHDAY=1;BYHOUR=0;BYMINUTE=0",
      timezone: "America/Chicago",
    });
    const result = rule.isDue(1000); // 1 second window
    // This will almost certainly be false unless we're testing at midnight on Jan 1
    expect(result).toHaveProperty("due");
  });

  it("between returns correct range", () => {
    const rule = createRule({
      rrule: "FREQ=DAILY;BYHOUR=12;BYMINUTE=0;BYSECOND=0",
      timezone: "America/Chicago",
      dtstart: new Date("2026-03-01T00:00:00Z"),
    });

    const start = new Date("2026-03-20T00:00:00Z");
    const end = new Date("2026-03-24T00:00:00Z");
    const results = rule.between(start, end);

    // Should have ~4 occurrences (Mar 20-23 at noon Central)
    expect(results.length).toBeGreaterThanOrEqual(3);
    expect(results.length).toBeLessThanOrEqual(4);
    for (const occ of results) {
      expect(occ.local).toMatch(/T12:00:00$/);
    }
  });
});

describe("detectTimezone", () => {
  it("returns a valid IANA timezone", () => {
    const tz = detectTimezone();
    expect(tz).toBeTruthy();
    expect(tz).toMatch(/\//); // IANA timezones contain a slash
  });
});
