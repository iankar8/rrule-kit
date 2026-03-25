import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createScheduler } from "../src/agent";
import * as fs from "fs";
import * as path from "path";

const TEST_DEDUP = path.join("/tmp", "rrule-kit-test-dedup.json");

beforeEach(() => {
  try { fs.unlinkSync(TEST_DEDUP); } catch {}
});

afterEach(() => {
  try { fs.unlinkSync(TEST_DEDUP); } catch {}
});

describe("createScheduler", () => {
  it("registers and lists tasks", () => {
    const scheduler = createScheduler({ dedupPath: TEST_DEDUP });
    scheduler.add({
      id: "test-task",
      rrule: "FREQ=DAILY;BYHOUR=9",
      timezone: "America/Chicago",
      handler: () => {},
    });

    expect(scheduler.list()).toEqual(["test-task"]);
  });

  it("removes tasks", () => {
    const scheduler = createScheduler({ dedupPath: TEST_DEDUP });
    scheduler.add({
      id: "test-task",
      rrule: "FREQ=DAILY;BYHOUR=9",
      timezone: "America/Chicago",
      handler: () => {},
    });
    scheduler.remove("test-task");
    expect(scheduler.list()).toEqual([]);
  });

  it("persists dedup state to disk", async () => {
    const handler = vi.fn();
    const scheduler = createScheduler({
      dedupPath: TEST_DEDUP,
      windowMs: 120_000,
    });

    // Add a task that fires every minute (so it's always "due" within 2 min window)
    scheduler.add({
      id: "frequent",
      rrule: "FREQ=MINUTELY;INTERVAL=1",
      timezone: "America/Chicago",
      handler,
    });

    // First tick should fire
    await scheduler.tick();
    expect(handler).toHaveBeenCalledTimes(1);

    // Dedup file should exist
    expect(fs.existsSync(TEST_DEDUP)).toBe(true);
    const state = JSON.parse(fs.readFileSync(TEST_DEDUP, "utf-8"));
    expect(state).toHaveProperty("frequent");

    // Second tick should NOT fire (same occurrence, already deduped)
    await scheduler.tick();
    expect(handler).toHaveBeenCalledTimes(1);

    scheduler.stop();
  });

  it("survives simulated restart", async () => {
    const handler = vi.fn();

    // First "process"
    const s1 = createScheduler({ dedupPath: TEST_DEDUP, windowMs: 120_000 });
    s1.add({
      id: "restart-test",
      rrule: "FREQ=MINUTELY;INTERVAL=1",
      timezone: "America/Chicago",
      handler,
    });
    await s1.tick();
    expect(handler).toHaveBeenCalledTimes(1);
    s1.stop();

    // "Restart" — new scheduler instance, same dedup file
    const s2 = createScheduler({ dedupPath: TEST_DEDUP, windowMs: 120_000 });
    s2.add({
      id: "restart-test",
      rrule: "FREQ=MINUTELY;INTERVAL=1",
      timezone: "America/Chicago",
      handler,
    });
    await s2.tick();
    // Should NOT fire again — dedup survived restart
    expect(handler).toHaveBeenCalledTimes(1);
    s2.stop();
  });

  it("nextOccurrences returns correct times", () => {
    const scheduler = createScheduler({ dedupPath: TEST_DEDUP });
    scheduler.add({
      id: "morning",
      rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0;BYSECOND=0",
      timezone: "America/Chicago",
      handler: () => {},
    });

    const next = scheduler.nextOccurrences("morning", 3);
    expect(next).toHaveLength(3);
    for (const occ of next) {
      expect(occ.local).toMatch(/T09:00:00$/);
    }
  });
});
