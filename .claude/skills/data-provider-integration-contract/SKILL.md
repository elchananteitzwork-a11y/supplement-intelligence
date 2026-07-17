---
name: data-provider-integration-contract
description: Ensures new or modified external data-provider integrations reuse this repository's existing provider-cache, provider-errors, confidence-mapping, and provenance patterns instead of inventing a new client pattern per provider.
when_to_use: Use when creating a module that calls an external data provider (Keepa, DSLD, PubMed, ClinicalTrials.gov, openFDA, DataForSEO, Apify, Rainforest, YouTube, or similar), editing an existing provider-integration file, or evaluating a new external data source during the Research & Design phase. Do not use for internal-only scoring math with no external call, tests that only mock a provider, or UI-only changes.
paths: lib/*-engine/**, lib/provider-cache/**, lib/provider-errors.ts, lib/reddit-client/**, lib/review-collector/**, lib/evidence/**, lib/ingredient-registry/**, supplement-intelligence/lib/*-engine/**, supplement-intelligence/lib/provider-cache/**, supplement-intelligence/lib/provider-errors.ts, supplement-intelligence/lib/reddit-client/**, supplement-intelligence/lib/review-collector/**, supplement-intelligence/lib/evidence/**, supplement-intelligence/lib/ingredient-registry/**
disallowed-tools: Agent
---

# Data Provider Integration Contract

A procedure, not a decision-maker. It does not invoke other Skills, spawn Agents, or route work.

## Before writing a new provider integration, confirm you are reusing, not reinventing

1. **Caching** — go through `lib/provider-cache/`. Do not write a new ad hoc cache or a bespoke TTL mechanism.
2. **Errors** — throw and catch through the error taxonomy in `lib/provider-errors.ts`. Do not let a raw fetch/SDK error reach the caller unclassified.
3. **Confidence mapping** — map the provider's own data-quality signals (sample size, freshness, source authority) to the CONFIRMED/INDICATED/LIMITED tiers used everywhere else in the product. See `confidence-tiered-extraction` for the tier definitions themselves.
4. **Provenance** — record source, fetch timestamp, and raw-response reference through `lib/provenance.ts`, so every claim can be traced back to what was actually returned.
5. **Fallback behavior** — define what happens when the provider is unavailable or rate-limited (LIMITED tier, not a crash). For Anthropic-specific rate/credit handling, use `llm-cost-rate-governance` instead — this Skill covers non-LLM data providers.

## Correct

A new provider client wraps its fetch in the existing `provider-cache` layer, throws `ProviderError` subtypes from `provider-errors.ts`, and returns a confidence tier alongside the data.

## Incorrect

A new provider client writes its own in-memory cache, throws a raw `Error`, and returns data with no tier or provenance record.

## Scope

Covers integration shape only — not whether the data source itself is worth building (that is `research-evidence-agent`'s live-feasibility judgment) and not whether the resulting claim is framed correctly (that is `confidence-tiered-extraction`). This Skill never delegates to another Agent.
