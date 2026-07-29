# Issue #7 — Stretch & Future Goals

Out of scope for the core issue #7 work (see `issue-7-implementation-plan.md`),
but discovered while designing it. Each is a candidate follow-up sub-issue.

## 1. "Draft available" dialog on load (stretch)

On app mount, if `getDraft()` returns a draft, surface it instead of leaving it
only in the selector. Use `dialogStore.openDialog` with:

- **Open draft** → load it as the current selection.
- **Discard** (`variant: "danger"`) → `deleteDraft()`.
- Cancel / dismiss → leave the draft in the selector for later.

**Why it matters:** it's the cleanest mitigation for the refresh-eviction risk —
after a refresh the app boots to "New Plan (Unsaved)", and the *next* edit would
otherwise silently fork a new draft over the persisted one. Prompting up front
makes the existing draft visible before that can happen.

## 2. Cancel-with-revert on the eviction warning

The core issue ships option **(b)** for the edit-time eviction warning: when a
first edit would fork a new draft while a *different* draft exists, the dialog
offers only **Save previous / Discard previous** (both keep the new edit). It has
**no Cancel**, because the triggering edit is usually a completed drag-drop and
reverting it is fiddly.

Once an **Undo** mechanism exists (see #3), add a third **Cancel** option that
reverts the just-applied edit and keeps the old draft untouched.

## 3. Undo button (the real fix)

The whole point of this feature is to *reduce* interruptive prompts. Every
prompt above (eviction warning, boss-switch, draft-on-load) is a stop-gap for
"we can't take a destructive action back." A general **Undo** would let us drop
most of these prompts entirely and just let people experiment freely. Biggest
lever; largest scope.

## 4. Disable "Save" when there is nothing to save

Today (and in the core issue) pressing **Save** on a plain saved plan with no
draft is an effective no-op re-save. Instead, disable the Save button when the
current selection has no unsaved changes (no active draft for it), so the UI
reflects state accurately.

## 5. Visual treatment for the draft in the selector (polish)

Optional: distinguish the `(draft)` option in the Plan Selector (italic, a
leading symbol, or a divider) so it reads as provisional rather than a peer of
finalized plans.
