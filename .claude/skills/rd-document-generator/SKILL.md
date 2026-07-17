---
name: rd-document-generator
description: Produces a milestone Research & Design document to a consistent template — reuse audit, existing architecture touched, files to change, risks, testing plan, smallest-correct-scope, and explicit non-goals — before any implementation begins.
when_to_use: Use when the Planner is opening a new milestone and needs an R&D document, or when architecture-agent has completed its reuse audit and needs to format findings into the standard structure. Do not use mid-milestone, for bug fixes that don't open a new milestone, or after an R&D document is already approved.
disallowed-tools: Agent
---

# R&D Document Generator

A procedure, not a decision-maker. It does not invoke other Skills, spawn Agents, or route work. It formats research into a document — it does not perform the research itself.

## Every R&D document produced must contain exactly these sections, in order

1. **Reuse audit** — what existing code, patterns, or infrastructure already does part of this (cite file paths and line numbers, not general claims).
2. **Existing architecture touched** — which modules this milestone will read from or depend on, unchanged.
3. **Files to change** — the exact, smallest set of files this milestone will create or edit.
4. **Risks** — what could regress, and how it will be caught.
5. **Testing plan** — how the approved scope will be verified before being marked complete.
6. **Smallest-correct-scope** — the minimum implementation that satisfies the milestone, stated explicitly so scope creep has something to be checked against.
7. **Non-goals** — what this milestone deliberately does not do, so a future milestone doesn't assume it was covered.

## Correct

A document where every claim in the Reuse Audit section cites a real file path, and Non-Goals explicitly lists what was considered and excluded.

## Incorrect

A document that says "we'll reuse existing patterns where possible" with no file references, or omits Non-Goals entirely.

## Scope

Consumes `architecture-agent`'s findings (or the Planner's own research); it does not re-derive them. `architecture-agent` has no Write/Edit tool, so it cannot act on this document even while using this Skill — it can only produce the document text for the Planner to carry forward. This Skill never delegates to another Agent.
