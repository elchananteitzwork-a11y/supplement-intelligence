---
name: feature-flag-staged-cutover
description: Formalizes this repository's built-but-not-cut-over workflow — a milestone may not move from "validated" to "live" without a recorded flag name, rollback plan, activation criteria, and validation evidence.
when_to_use: Use when the Planner is about to mark a milestone complete or flip a feature flag to live, or when an implementing Agent is wiring the actual toggle/flag code for a new engine or pipeline stage. Do not use for routine bug fixes with no flag, work explicitly scoped "build only, no cutover" in its R&D document, or test-only changes.
disallowed-tools: Agent
---

# Feature Flag / Staged Cutover Discipline

A procedure, not a decision-maker. It does not invoke other Skills, spawn Agents, or route work. It does not itself decide whether a milestone is ready — it defines what must be recorded before that decision is made.

## Before a milestone moves from "built and validated" to "live," confirm all five are recorded

1. **Flag name** — the exact identifier gating the new behavior.
2. **Activation criteria** — what evidence justifies flipping it (specific validation results, not "it looks done").
3. **Rollback plan** — the exact steps to revert if the cutover causes a regression, and who can execute them.
4. **Validation evidence** — a link or reference to the actual test/validation output that supports cutover, not a restated claim of confidence.
5. **Explicit approval** — the project owner's sign-off is recorded before the flag flips, not assumed.

## Correct

"M2.14 is built and validated (see validation report X) but intentionally not cut over — activation criteria not yet met." Recorded as such in the master plan, with the flag name and rollback path noted.

## Incorrect

Marking a milestone "complete" in the master plan with no record of what would need to happen to safely turn it off if it broke something after cutover.

## Scope

This is a Planner-owned decision discipline. An implementing Agent uses it only to record the mechanics of the toggle it is wiring — it does not grant that Agent authority to decide the milestone is ready. This Skill never delegates to another Agent.
