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
after a refresh the app boots to "New Plan (Unsaved)", and the _next_ edit would
otherwise silently fork a new draft over the persisted one. Prompting up front
makes the existing draft visible before that can happen.

## -- Goal 2 Resolved via Initial Implementation Change --

## 3. Undo button (the real fix)

The whole point of this feature is to _reduce_ interruptive prompts. Every
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

## 6. Mirror the current selection's metadata in hook state (perf / cleanup)

`usePlanSelection.handleAutosave` calls `loadPlan(currentPlanId)` on **every
edit**, purely to answer "is the current selection a draft, and what are its
`bossId`/`planName`/`sourcePlanId`?" — a `localStorage.getItem` + `JSON.parse`
in the hot path.

**Fix:** keep that answer in React. Give the hook a companion state to
`currentPlanId` holding the current selection's metadata (`isDraft`, `bossId`,
`planName`, `sourcePlanId`), and set it wherever the selection changes rather
than re-reading storage to reconstruct it:

- `handlePlanChange` already calls `loadPlan(planId)` — populate the meta there
  for free (and `null` it on the "New Plan (Unsaved)" / falsy-`planId` path).
- The fork branch of `handleAutosave` sets it to the new draft's meta;
  `handleTimelineChange` nulls it.

Then `handleAutosave` reads meta from state instead of storage, and storage
becomes **write-through only** in the edit path — no read, no parse per edit.
All selection mutations already funnel through this hook, so the mirror stays
contained.

**Keep in mind:**

- The `savePlan` **write** (`JSON.stringify` of the whole plan) is the larger
  cost and stays. Fine today because autosave fires per _committed_ edit (drop,
  not per drag-pixel); if edits ever get chattier, debouncing the write is the
  next lever.
- One storage read genuinely stays: the orphan-draft check `getDraft()` in
  `handlePlanChange` is about storage, not the current selection — leave it.

**Best sequenced after Steps 5–6:** those add the plan-switch / boss-switch
dialogs, which also touch selection transitions and would set the same meta, so
doing this once they land avoids reworking the mirror twice.

## 7. Handle Save As name collisions

Today, Save As always calls `generatePlanId`, which appends `Date.now()` — so
saving with a name that matches an existing plan silently creates a **second**
plan with the same `planName` rather than replacing the original. Not part of
issue #7's scope (the implementation plan's Step 4 mistakenly implied this was
covered; it isn't — no collision handling exists yet).

**Fix, when picked up:** on Save As submit, look up whether a plan with that
name (for the current boss) already exists; if so, either reuse its id (true
replace) or warn the user before overwriting.

## 8. Disallow exporting drafts - require a Save(/Save As) first

When exporting, if a draft is active, a draft will be exported. This could possibly break our "one draft allowed" constraint as well as generally causing confusion when an exported draft is later imported. We should not allow a draft to be exported, and instead require the user to Save first. To accomplish this, we can open a Save As dialog on the export path which exports when a save button is clicked and cancels the export if the user cancels the save dialog.
