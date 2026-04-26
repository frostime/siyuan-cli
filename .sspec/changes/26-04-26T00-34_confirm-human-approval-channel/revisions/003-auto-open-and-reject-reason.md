---
revision: 3
date: 2026-04-26T15:25:00
trigger: "correction"
---

# auto-open-and-reject-reason

## Reason
User feedback asks for two UX improvements during the active approval flow:
1. when a CLI command blocks on approval, the approval URL should open automatically so the human can operate in the browser immediately;
2. reject should support an optional human-written reason so the blocked CLI / agent workflow can receive actionable feedback.

These changes refine the approved approval-flow interaction without changing the core safety model.

## Changes

### Spec Impact
The approval handoff remains browser-based and inline-blocking, but the usability bar becomes stricter:
- a confirm-gated CLI call SHOULD attempt to open the Approval Center automatically before waiting;
- a rejection MAY carry a human-authored reason back to the caller.

### Design Impact
- browser launch should be driven from the CLI-side `requestAndWait()` flow, with stronger Windows launch fallbacks and an explicit fallback warning if launch fails;
- rejection payloads and decision objects should carry an optional `note` field end-to-end;
- the Approval Center UI should expose a small optional reject-reason input and include it in reject submissions;
- CLI manual reject should accept an optional reason too.

### Task Impact
Add a short follow-up task set for:
- improving browser auto-open reliability and fallback reporting;
- plumbing reject reason through UI, client, store, and error details;
- validating that auto-open + reject-reason behavior work in the current Windows/MSYS environment.
