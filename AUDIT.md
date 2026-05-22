# Timezone Scheduler Audit

If your agent, workflow, or calendar product has recurring jobs that fire at the wrong local time, duplicate around DST, or skip silently after restarts, I can do a fixed-fee audit.

The core failure modes are documented in [PROOF.md](PROOF.md).

## Fixed Scope

**Price:** $1,000 flat  
**Turnaround:** 48 hours after I have a repro, repo access, or enough implementation detail  
**Contact:** [email Ian](mailto:ian@iankar.com?subject=Timezone%20scheduler%20audit) or [open an audit request](https://github.com/iankar8/rrule-kit/issues/new?template=audit-request.yml)

## How To Buy

1. Send the smallest safe repro or open an audit request.
2. I confirm whether the problem fits this fixed scope.
3. You confirm the $1,000 scope in writing.
4. I send an invoice before starting.
5. I deliver the memo, patch plan, and test cases within 48 hours of having the materials.

If the issue is not a fit, I will say so before invoicing.

## What You Get

- A reproduction of the current scheduler/timezone failure mode, or a written note if the failure is architectural rather than reproducible from the provided materials.
- A risk map covering UTC drift, floating local time, DST gaps, DST duplicates, and restart-related double fires.
- A patch plan using `rrule-kit`, `rrule-kit/agent`, or a stack-specific equivalent if this package is not a fit.
- Minimal test cases for wall-clock scheduling, DST boundaries, and occurrence-level deduplication.
- A 30-minute implementation walkthrough.

## Good Fits

- AI agent routines that should run at a user's local wall-clock time.
- Workflow schedulers where "every day at 9am" should mean local 9am through DST.
- Calendar/RRULE code where UTC conversion or `TZID` handling is producing wrong occurrences.
- Cron systems that need one execution per intended local occurrence, including fall-back nights.

## Not A Good Fit

- Generic cron setup with no timezone or user-facing wall-clock semantics.
- Full scheduler rewrites.
- Production incident response where I would need direct access to sensitive systems.

## What To Send

Email the smallest useful packet or open an [audit request](https://github.com/iankar8/rrule-kit/issues/new?template=audit-request.yml):

- The cron/RRULE/schedule expression.
- The intended timezone semantics.
- The observed wrong fire time or duplicate/skip.
- The scheduler library or runtime involved.
- Any existing test, issue, or log excerpt that shows the failure.

If the problem is a fit, I will reply with the exact scope and payment/invoice step before starting. To invoice, I need the billing name, billing email, and any purchase-order or vendor details you require.
