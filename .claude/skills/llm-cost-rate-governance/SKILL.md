---
name: llm-cost-rate-governance
description: Prevents production failures from exhausted LLM credits, rate limits, excessive token usage, missing retry policies, or absent graceful degradation. Applies to any code path that calls the Anthropic SDK directly or wraps such a call.
when_to_use: Use when creating or editing a file that imports @anthropic-ai/sdk, or adding a new pipeline stage that consumes Claude. Do not use for non-Anthropic provider code (use data-provider-integration-contract instead), UI edits, or tests that only mock the Anthropic client.
paths: lib/ai-interpretation/**, lib/thesis-engine/**, lib/stage2/**, lib/stage3/**, lib/stage4/**, lib/review-engine/ai/**, lib/news-engine/**, lib/keyword-engine/**, lib/manufacturing-engine/providers/**, lib/categories/**, lib/consumer-intelligence/**, supplement-intelligence/lib/ai-interpretation/**, supplement-intelligence/lib/thesis-engine/**, supplement-intelligence/lib/stage2/**, supplement-intelligence/lib/stage3/**, supplement-intelligence/lib/stage4/**, supplement-intelligence/lib/review-engine/ai/**, supplement-intelligence/lib/news-engine/**, supplement-intelligence/lib/keyword-engine/**, supplement-intelligence/lib/manufacturing-engine/providers/**, supplement-intelligence/lib/categories/**, supplement-intelligence/lib/consumer-intelligence/**
disallowed-tools: Agent
---

# LLM Cost & Rate Governance

A procedure, not a decision-maker. It does not invoke other Skills, spawn Agents, or route work.

## Before adding or editing a Claude call site, confirm

1. **Rate-limit and credit-exhaustion handling.** A 429 or insufficient-credit response must not crash the pipeline or return an unhandled exception to the user. Catch it explicitly.
2. **Retry with backoff** on transient failures, bounded (do not retry indefinitely).
3. **Graceful degradation.** On exhausted retries, return a LIMITED-confidence result with an explicit "not possible with available data" statement (per `confidence-tiered-extraction`) rather than surfacing a raw provider error.
4. **Bounded context.** No unbounded prompt growth — truncate or summarize input before it reaches the model, and document why the chosen context size is sufficient.
5. **No silent cost blind spots.** A new call site should be traceable (model, approximate token volume) for later cost review, even though this repo has no formal budget dashboard yet.

## Why this exists

This repository has already had a production incident where Anthropic API credits were exhausted and blocked all new analyses. This checklist exists to catch that failure mode before it ships again, not as a hypothetical best practice.

## Correct

A new pipeline stage wraps its `anthropic.messages.create()` call in a try/catch that distinguishes rate-limit/credit errors from other failures, retries transient errors with backoff, and falls back to a LIMITED-tier result with a clear message on exhaustion.

## Incorrect

A new pipeline stage calls the SDK directly with no error handling; any failure propagates as an unhandled exception.

## Scope

Covers Anthropic call sites only. Non-LLM providers are `data-provider-integration-contract`'s scope. This Skill never delegates to another Agent.
