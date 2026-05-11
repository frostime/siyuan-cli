---
revision: 3
date: 2026-05-11T17:36:39
trigger: "review-feedback"
---

<!-- MUST set trigger to one of: review-feedback | discovery | scope-expansion | correction
This file records scope/design changes after the design gate.
spec.md and design.md baselines are immutable; all post-gate evolution goes here.
File naming: revisions/NNN-description.md (incrementing number). -->

# emit-warnings-for-custom-response-filters

## Reason
Review found that custom response filters remove or mask denied content without emitting `CONTENT_FILTERED`, unlike declarative response guards. This can make Agent consumers mistake permission-filtered partial results for complete kernel results.

## Changes

### Spec Impact
Custom response filters for newly added endpoints must emit the same filtering warning semantics as declarative response guards when content is removed or masked.

### Design Impact
Extend the `filterResponse` context with a warning emitter and update shared response-guard helpers to call it when `PermissionEngine.filterItems` reports removals.

### Task Impact
Add feedback tasks to update filter context/types, emit warnings from custom filters, and add tests for map/object/sibling custom filters.
