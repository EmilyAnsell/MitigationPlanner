# Issue #7 — Stretch & Future Goals

Out of scope for the core issue #7 work (see `issue-7-implementation-plan.md`),
but discovered while designing it. Each is a candidate follow-up sub-issue.

## 1. Draft Visible on Load

Currently, if the application is closed and re-opened or reloaded while a draft is being worked on, it will load to the default New Plan (unsaved) with the draft hidden away in the plan selector. On load, it would be best to present the draft to the user so they can recover any potentially lost work without accidentally losing it on a switch. This preserves the "never have a draft in the plan list but not selected" expectation.

### PR review notes (issue #24)

Two concrete data-loss paths from this gap, both raised in the #25 review. They
share one root cause — **the "`currentPlanId` is the draft whenever a draft
exists" invariant is maintained in memory only, and a reload breaks it** — so
selecting the draft on load closes both. Worth keeping them in view while
implementing, since the sequencing below matters.

**A. "Save and Continue" saves the wrong content and then deletes the draft.**
`confirmDiscardDraft`'s Save button routes to `usePlanSelection.handleSave`,
which saves **whatever is currently in App state** — but the dialog fires
whenever `getDraft()` is non-null, whether or not that draft is what's loaded.
After a reload: draft in storage, `currentPlanId === null`, timeline empty.
Pick any saved plan from the selector → prompt → "Save and Continue" →
`handleSave` takes its `!currentPlan` branch → Save As → saves the **empty**
on-screen plan under the new name, and `openSaveAsDialog` then calls
`deleteDraft()`. The draft is destroyed and the "saved" plan is empty.

Selecting the draft on load makes this unreachable in practice, but the guard
is still unsound on its own: any future path that lets `currentPlanId` and
`getDraft().planId` diverge re-opens it. Consider hardening `handleSave` too —
operate on `getDraft()` when the draft isn't the current selection, or don't
offer Save at all when `currentPlanId !== draft.planId`.

**B. A reload plus one edit silently destroys the previous draft.**
On boot `currentPlanId` is `null`, so the first edit takes `handleAutosave`'s
fork branch, and `saveDraft` opens with an unconditional `deleteDraft()`. Last
session's draft is gone with no prompt — the exact loss the feature exists to
prevent. Note the fork branch fires on the _first_ edit, so restoring the draft
must happen at mount, before any edit can be made, rather than lazily.

**C. Drafts are matched globally, not per-boss.** `getDraft()` scans every
plan while `getPlansByBoss` filters by boss, so a draft belonging to boss A
raises "Switching to a different plan will delete your draft" while the user is
on boss B and cannot see it in their list. Only reachable via the same reload
(boss switching otherwise resolves the draft first), and it is the state path A
runs through. Either scope the guard's lookup to `currentTimeline` or restore
the draft's boss along with the draft on load.

## 2. Disable "Save" when there is nothing to save

Today (and in the core issue) pressing **Save** on a plain saved plan with no
draft is an effective no-op re-save. Instead, disable the Save button when the
current selection has no unsaved changes (no active draft for it), so the UI
reflects state accurately.

## 3. Visual treatment for the draft in the selector (polish)

Optional: distinguish the (draft) option in the Plan Selector (italic, a leading symbol, a color, or a divider) so it reads as provisional rather than a peer of finalized plans.

## 4. Mirror the current selection's metadata in hook state (perf / cleanup) (do after 5,6,7 if 7 doesn't render unnecessary)

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

## 5. Handle Save As name collisions

Today, Save As always calls `generatePlanId`, which appends `Date.now()` — so
saving with a name that matches an existing plan silently creates a **second**
plan with the same `planName` rather than replacing the original. Not part of
issue #7's scope (the implementation plan's Step 4 mistakenly implied this was
covered; it isn't — no collision handling exists yet).

**Fix, when picked up:** on Save As submit, look up whether a plan with that
name (for the current boss) already exists; if so, either reuse its id (true
replace) or warn the user before overwriting.

## 6. Disallow exporting drafts - require a Save(/Save As) first

When exporting, if a draft is active, a draft will be exported. This could possibly break our "one draft allowed" constraint as well as generally causing confusion when an exported draft is later imported. We should not allow a draft to be exported, and instead require the user to Save first. To accomplish this, we can open a Save As dialog on the export path which exports when a save button is clicked and cancels the export if the user cancels the save dialog.

## 7. Subscribe PlanManager to Storage to prevent multi-tab desync

`PlanManager` reads `localStorage` during render
`PlanManager.jsx` calls `getPlansByBoss(currentTimeline)` and
`loadPlan(currentPlanId)` in its render body. That is an impure render over an
external mutable store — precisely what `useSyncExternalStore` exists for, and
what this codebase already does correctly for `dialogStore` / `GlobalDialog`.

Anything that mutates the store from outside this tab will break the plan rendering,
since nothing subscribes to `storage` events: a second tab saving,
renaming, or deleting a plan leaves this tab's dropdown, `currentPlan` lookups,
and Delete/Export labels stale until an unrelated re-render.

So this is **low urgency, real as a trap**: the invariant "every storage write
is paired with a state change" is unwritten and unenforced, and the first write
that isn't paired will silently not appear.

**Fix:** give `planStorage` a `subscribe` / `getSnapshot` pair (same shape as
`dialogStore`) and consume it from `PlanManager` via `useSyncExternalStore`,
with every mutating export emitting a change — and a `storage` event listener
for the cross-tab case. This also **subsumes future-goal §4** — a subscribed
snapshot removes the per-edit `getItem` + `JSON.parse` from `handleAutosave`
without the hand-maintained state mirror that goal proposes, so the two should
be picked up together **(or §4 dropped in favour of this)**.
