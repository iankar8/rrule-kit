/**
 * rrule-kit/agent — Scheduling primitives for AI agents.
 *
 * Solves the three problems every agent scheduler gets wrong:
 * 1. Timezone: RRULE fires at correct wall-clock time
 * 2. Dedup: Persisted state survives process restarts
 * 3. Single-fire: Only one execution per occurrence, even with multiple processes
 */

import * as fs from "fs";
import * as path from "path";
import { createRule, detectTimezone, type Occurrence, type RRuleOptions } from "./index";

export { detectTimezone } from "./index";
export type { Occurrence } from "./index";

/** A scheduled task definition */
export interface ScheduledTask {
  /** Unique ID for this task (used as dedup key) */
  id: string;
  /** RRULE string (e.g. "FREQ=DAILY;BYHOUR=9;BYMINUTE=0") */
  rrule: string;
  /** IANA timezone (e.g. "America/Chicago"). Falls back to system timezone. */
  timezone?: string;
  /** Handler called when the task fires */
  handler: (occurrence: Occurrence) => void | Promise<void>;
}

/** Options for the agent scheduler */
export interface SchedulerOptions {
  /** Path to persist dedup state. Defaults to ~/.rrule-kit/dedup.json */
  dedupPath?: string;
  /** Tick interval in ms. Defaults to 60_000 (60s). */
  tickIntervalMs?: number;
  /** Window in ms to check for due occurrences. Defaults to 90_000 (90s). */
  windowMs?: number;
  /** Default timezone for tasks that don't specify one. Falls back to system tz. */
  defaultTimezone?: string;
  /** Called on errors. Defaults to stderr. */
  onError?: (taskId: string, error: unknown) => void;
}

interface DedupState {
  [taskId: string]: number; // epoch ms of last fired occurrence
}

/**
 * Create an agent scheduler that fires tasks at correct local times,
 * survives process restarts, and prevents duplicate executions.
 *
 * @example
 * ```ts
 * import { createScheduler } from "rrule-kit/agent";
 *
 * const scheduler = createScheduler();
 *
 * scheduler.add({
 *   id: "morning-briefing",
 *   rrule: "FREQ=DAILY;BYHOUR=9;BYMINUTE=0",
 *   timezone: "America/Chicago",
 *   handler: (occ) => sendTelegram(`Good morning! It's ${occ.local}`),
 * });
 *
 * scheduler.add({
 *   id: "weekly-review",
 *   rrule: "FREQ=WEEKLY;BYDAY=MO;BYHOUR=9",
 *   timezone: "America/Chicago",
 *   handler: () => generateWeeklyReport(),
 * });
 *
 * scheduler.start();
 * // ... on shutdown:
 * scheduler.stop();
 * ```
 */
export function createScheduler(opts: SchedulerOptions = {}) {
  const dedupPath = opts.dedupPath ?? path.join(
    process.env.HOME || "~",
    ".rrule-kit",
    "dedup.json",
  );
  const tickMs = opts.tickIntervalMs ?? 60_000;
  const windowMs = opts.windowMs ?? 90_000;
  const defaultTz = opts.defaultTimezone ?? detectTimezone();
  const onError = opts.onError ?? ((id, err) => {
    process.stderr.write(`[rrule-kit] task "${id}" failed: ${err}\n`);
  });

  const tasks = new Map<string, ScheduledTask>();
  let timer: ReturnType<typeof setInterval> | null = null;
  let dedup: DedupState = loadDedup();

  function loadDedup(): DedupState {
    try {
      if (!fs.existsSync(dedupPath)) return {};
      const raw = JSON.parse(fs.readFileSync(dedupPath, "utf-8"));
      // Prune entries older than 48 hours
      const cutoff = Date.now() - 48 * 60 * 60 * 1000;
      const pruned: DedupState = {};
      for (const [k, v] of Object.entries(raw)) {
        if (typeof v === "number" && v > cutoff) pruned[k] = v;
      }
      return pruned;
    } catch {
      return {};
    }
  }

  function saveDedup(): void {
    try {
      const dir = path.dirname(dedupPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(dedupPath, JSON.stringify(dedup, null, 2));
    } catch {}
  }

  async function tick(): Promise<void> {
    const now = Date.now();
    const windowStart = new Date(now - windowMs);
    const windowEnd = new Date(now);

    for (const [id, task] of tasks) {
      try {
        const tz = task.timezone || defaultTz;
        const rule = createRule({ rrule: task.rrule, timezone: tz });
        const hits = rule.between(windowStart, windowEnd);

        if (hits.length === 0) continue;

        const occ = hits[0];
        const lastFired = dedup[id] || 0;

        // Skip if we already fired for this occurrence
        if (occ.epochMs <= lastFired) continue;

        // Fire
        dedup[id] = occ.epochMs;
        saveDedup();

        await task.handler(occ);
      } catch (err) {
        onError(id, err);
      }
    }
  }

  return {
    /** Register a scheduled task */
    add(task: ScheduledTask): void {
      tasks.set(task.id, task);
    },

    /** Remove a scheduled task */
    remove(id: string): void {
      tasks.delete(id);
      delete dedup[id];
      saveDedup();
    },

    /** Start the tick loop */
    start(): void {
      if (timer) return;
      // Run once immediately
      tick().catch((err) => onError("_tick", err));
      timer = setInterval(() => {
        tick().catch((err) => onError("_tick", err));
      }, tickMs);
    },

    /** Stop the tick loop */
    stop(): void {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    /** Manually trigger a tick (useful for testing) */
    tick,

    /** Check if a specific task is due right now (without firing it) */
    isDue(id: string): { due: boolean; occurrence?: Occurrence } {
      const task = tasks.get(id);
      if (!task) return { due: false };

      const tz = task.timezone || defaultTz;
      const rule = createRule({ rrule: task.rrule, timezone: tz });
      const { due, occurrence } = rule.isDue(windowMs);

      if (!due || !occurrence) return { due: false };

      const lastFired = dedup[id] || 0;
      if (occurrence.epochMs <= lastFired) return { due: false };

      return { due: true, occurrence };
    },

    /** Get next N occurrences for a task */
    nextOccurrences(id: string, count: number): Occurrence[] {
      const task = tasks.get(id);
      if (!task) return [];
      const tz = task.timezone || defaultTz;
      return createRule({ rrule: task.rrule, timezone: tz }).next(count);
    },

    /** List all registered task IDs */
    list(): string[] {
      return [...tasks.keys()];
    },

    /** Get dedup state (for debugging) */
    dedupState(): Readonly<DedupState> {
      return { ...dedup };
    },
  };
}
