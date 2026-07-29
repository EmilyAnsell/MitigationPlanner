# Issue #7 — Unsaved Changes Protection: Implementation Plan (TDD)

> A step-by-step plan for a developer unfamiliar with the current save/storage
> system. Each step is self-contained enough to hand to another model, with the
> context needed to review the result.
>
> **This issue is done test-first.** For every step: write the tests from the
> requirements/acceptance criteria, watch them fail, *then* implement until green.
> Stretch/future ideas live in `issue-7-future-goals.md`.

---

## 0. Background — how saving works *today*

Read this once before starting. It's the mental model the rest of the plan assumes.

### Where state lives

All core plan state lives in `src/App.jsx` (`MitigationPlanner`):

- `partyComp` — the 8-slot party (job IDs)
- `placements` — abilities placed on the timeline
- `currentTimeline` — which boss is selected (key into `BOSS_TIMELINES`)
- `currentPlanId` — id of the currently-selected **saved** plan, or `null`

### How it's persisted

`src/utils/planStorage.js` is the only thing that touches `localStorage`. Every
saved plan is one key: `ffxiv-mit-plan-<planId>`, holding:

```js
{ bossId, planName, partyComp, placements, lastModified }
```

Key functions: `getPlansByBoss(bossId)`, `savePlan(planId, data)`,
`loadPlan(planId)`, `deletePlan(planId)`, `generatePlanId(bossId, name)`
(appends `Date.now()` so ids are unique), plus `exportPlan` / `importPlan`.

### The three behaviors that issue #7 changes

1. **Auto-save overwrites the real plan.** `App.jsx` has a `useEffect`
   (currently ~lines 59–70): when `placements`/`partyComp` change and
   `currentPlanId` is set, it **overwrites that saved plan in place**. No way to
   experiment without destroying the original.
2. **Unsaved work isn't persisted at all.** With `currentPlanId === null` (the
   "New Plan (Unsaved)" option) the effect does nothing, so switching or
   refreshing silently discards the work.
3. **Switching boss / plan discards silently.** `handleTimelineChange` (~72)
   resets `placements`; `handlePlanChange` (~78) loads over current state.
   Neither warns.

There is currently **no restore-on-mount** — on refresh the app always starts
at `currentPlanId = null`, boss `dancing-green`, empty placements.

### The target model (issue #7 + the "Unsaved Changes Protection" wiki notes)

Auto-save into a single **draft** so work is never lost, and prompt only where a
draft would otherwise be silently dropped.

- Auto-save writes to a **draft**, never over a finalized plan.
- **At most one draft** exists in localStorage at any time.
- Editing a saved plan "Foo" forks a draft named **"Foo (draft)"**; "Foo" stays
  untouched until the user explicitly **Saves**.
- The draft is **selectable in the Plan Selector** and **persists in storage
  across refresh** — but is **not auto-loaded** on refresh (app boots to
  "New Plan (Unsaved)"; the user re-selects the draft if they want it).
- **Save** commits the draft onto its original plan, then removes the draft.
- **Save As** writes a brand-new plan, then removes the draft.
- **Switching boss, or switching to another plan,** while a draft exists prompts:
  **Save / Discard and Continue / Cancel**.
- The draft is **pruned** when a new draft is created, or on Save / Save As /
  Discard.

---

## Locked design decisions

1. **Draft identity.** The draft is a normal plan key tagged with `isDraft: true`
   and `sourcePlanId` (the plan it forked from, or `null` for from-scratch).
   The `isDraft` flag — not the id string — is the source of truth for "which key
   is the draft," so **"at most one draft" = always delete the existing draft
   before writing a new one.** Draft id follows `${bossId}-<sanitized>-draft`.
2. **From-scratch drafts** get `sourcePlanId: null`, `planName: "New Plan
   (draft)"`, id `${bossId}-new-plan-draft`. **Save** on a source-less draft
   falls through to the **Save As** flow (prompt for a name).
3. **Party-comp-only edits count as changes** (matches today's effect deps).
4. **Selector wording.** Static `"New Plan (Unsaved)"` stays as the "start fresh"
   choice; an active from-scratch draft appears separately as `"New Plan
   (draft)"`.
5. **Switching to another saved plan (or to "New Plan (Unsaved)") while a draft
   exists prompts** with **Save / Discard and Continue / Cancel**, mirroring the
   boss-switch flow (Step 6). The draft is resolved at the natural moment —
   *leaving* the plan — not on the first edit of the newly-loaded plan (which is
   a surprising point, since the user has already moved on and the modal wouldn't
   even be saving what's currently on screen). **Selecting the draft itself does
   not prompt** (you're returning to it, not abandoning it). **Importing leaves
   the draft alone** — the draft is safe in storage even though import replaces
   the on-screen placements; no prompt.
6. **No edit-time eviction warning.** Because a draft is always resolved when you
   switch away from its plan (decision #5) or its boss (Step 6), you can never be
   editing plan B while a plan-A draft lingers — so the cross-plan eviction case
   is designed out of normal use. The **one residual path** is a draft orphaned
   in storage after a **refresh** (decision #7: not auto-loaded): editing "New
   Plan (Unsaved)" without re-selecting would let `saveDraft` replace it
   silently. The "at most one draft" invariant still holds mechanically
   (Step 1 `saveDraft` deletes-first); protecting the orphan's *contents* is the
   job of the **"Draft available" dialog on load** (future-goals #1), the proper
   fix for the refresh path. Consistent with the philosophy of *reducing* prompts
   until an Undo mechanism lands.
7. **Refresh** does **not** reload the draft; app boots to "New Plan (Unsaved)".
8. **Save of a plain saved plan with no draft** keeps today's behavior
   (effective no-op re-save). "Disable Save when nothing to save" → future.

---

## Step 1 — Storage layer: the draft API (test-first)

**File:** `src/utils/planStorage.js` + **new** `tests/unit/planStorage.test.js`

**ACs covered:** "Maximum one draft per localStorage instance"; groundwork for
all pruning ACs.

**Write tests first** (unit; follow `tests/unit/cooldownCalculations.test.js`
conventions — globals on, one `describe` per function, `test.each` for pure
mappings). **First verify** whether the `node` (jsdom) project gives you a real
`localStorage`; if not, install a small mock in `beforeEach` and clear it in
`afterEach`. Assert:
- `saveDraft(...)` creates exactly one key with `isDraft: true`; calling it again
  **replaces** the draft (never two draft keys).
- `getDraft()` returns `null` when none exists, the object (including its id)
  when one does.
- `commitDraft(draft)` writes `partyComp`/`placements` onto `sourcePlanId`
  (preserving the original's `planName`/`bossId`) and leaves **no** draft.
- `deleteDraft()` is a safe no-op when there's no draft.
- `getPlansByBoss(bossId)` still includes the draft.

**Then implement** these functions:
- `getDraft()` — scan `getAllPlans()` for `isDraft === true`, return it with its
  `planId` (or `null`).
- `saveDraft({ bossId, planName, partyComp, placements, sourcePlanId })` —
  `deleteDraft()` first, then write a key with `isDraft: true`, `sourcePlanId`,
  and id `${bossId}-<sanitized>-draft`. Return the draft id.
- `deleteDraft()` — remove the draft if present.
- `commitDraft(draft)` — `savePlan(draft.sourcePlanId, {…original meta, partyComp,
  placements})` then `deleteDraft()`. Only valid when `sourcePlanId` is set.
- Extract a shared `sanitizeName(name)` from `generatePlanId` so the draft id and
  the committed plan id sanitize identically. (Don't duplicate the regex.)

**Done when:** draft CRUD is green with zero behavior change elsewhere.

---

## Step 2 — Draft persists across refresh & is selectable (test-first)

**Files:** `src/App.jsx`, `src/components/PlanManager.jsx` (verification-heavy —
little new code)

**ACs covered:** "Draft persists through app refresh"; "Plan switching retains
draft in selector."

**Write tests first** (browser; follow `tests/browser/MitigationPlanner.test.jsx`
— `render(<App />)`, query via `page`, `afterEach(cleanup + localStorage.clear)`):
- After a draft exists, **unmount + remount** `<App />`: the draft is **still an
  option in the selector** and the app boots to "New Plan (Unsaved)" (draft is
  *not* auto-loaded).
- Selecting the draft from the selector loads its placements.
- Selecting a different plan and back leaves the draft present in the selector.

> **Forward note:** Step 5 adds a Save/Discard/Cancel prompt to plan switching.
> When it lands, this "select a different plan and back" scenario will route
> through that dialog (e.g. **Cancel** to stay put, or **Discard** to drop the
> draft), so this test is updated then to drive the dialog. That's an
> intentional behavior change (a design decision), not a test weakened to force
> a pass — see `CLAUDE.md` on when tests may change.

**Then implement:** likely nothing beyond confirming `getPlansByBoss` surfaces
the draft and `handlePlanChange` loads it. If the selector filters drafts out,
stop filtering. **Do not** add mount-restore of the draft.

**Watch out for:** selecting the draft must route through the Step 3 "just
loaded" guard so it doesn't immediately fork a second draft.

**Done when:** the draft round-trips through remount and selection without being
auto-loaded or duplicated.

---

## Step 3 — Draft-aware auto-save: the fork (test-first, core change)

**File:** `src/App.jsx` (the auto-save `useEffect`, ~lines 59–70)

**ACs covered:** the heart of "auto-save writes to a draft, never over a
finalized plan."

**Write tests first** (browser):
- Load a saved plan "Foo", make an edit → a `"Foo (draft)"` option appears,
  `sourcePlanId` points at Foo, and **Foo itself is unchanged** in storage.
- Edit the draft again → still exactly one draft; name/source unchanged.
- Start from "New Plan (Unsaved)", edit → a `"New Plan (draft)"` draft appears
  (`sourcePlanId: null`).
- **Guard test:** load a plan and switch away **without editing** → **no** draft
  is created.

*(Switching-away protection is not tested here — the plan-switch prompt is
Step 5. Here, forking simply replaces any existing draft via `saveDraft`'s
delete-first, upholding the single-draft invariant mechanically.)*

**Then implement** the new effect behavior on a genuine edit:
- Current selection **is the draft** → `saveDraft` in place (same `sourcePlanId`).
- Current selection is a **saved plan** "Foo" → `saveDraft` with
  `sourcePlanId = Foo.planId`, `planName = "Foo (draft)"`, then switch
  `currentPlanId` to the new draft. Leave "Foo" untouched.
- **Nothing selected** → `saveDraft` with `sourcePlanId: null`, `planName:
  "New Plan (draft)"`, then select it.

**The critical pitfall — tell the implementer explicitly.** The effect fires on
*every* `placements`/`partyComp` change, including the ones from *loading*
(Step 2 selection, `handlePlanChange`, import). Without a guard, merely selecting
"Foo" instantly forks "Foo (draft)". Use a ref flag
(`skipNextAutoSave.current = true`) set right before any programmatic
load-`setState`, and early-return + clear it in the effect. The guard test above
is what proves this works.

**Watch out for:** switching selection to the new draft inside the effect can
re-trigger it — make sure that doesn't loop or double-write; keep `sourcePlanId`
stable across subsequent edits.

**Done when:** editing forks/updates exactly one draft and never mutates a
finalized plan; loading never forks.

---

## Step 4 — Save and Save As (+ pruning) (test-first)

**File:** `src/components/PlanManager.jsx` (`handleSave`, `openSaveAsDialog`)

**ACs covered:** "New-name save creates new plan without draft"; "Same-name
save-as replaces existing plan"; "No drafts remain after save-as"; commit path.

**Write tests first** (browser):
- With a `"Foo (draft)"` active, **Save** → Foo now holds the draft's content,
  **no draft remains**, and Foo is the selected plan.
- **Save** on a from-scratch draft → the Save-As name dialog appears.
- **Save As** with a new name → a new plan exists, **no draft remains**, new plan
  selected.
- **Save As** reusing an existing name → that plan is **replaced** (confirm
  `generatePlanId` semantics support this, or handle the name collision
  explicitly).

**Then implement:**
- `handleSave`: draft **with** `sourcePlanId` → `commitDraft`, then select the
  source. From-scratch draft → `openSaveAsDialog`. Plain saved plan, no draft →
  today's behavior.
- `openSaveAsDialog`: after `savePlan(newPlanId, …)`, `deleteDraft()` and select
  the new plan. Keep the existing `SaveAsBody` name-validation / Enter-to-submit.
- **Import (`handleFileSelect`)**: unchanged — importing **leaves** the draft.

**Done when:** both commit paths prune the draft and select the right plan.

---

## Step 5 — Plan-switch confirmation dialog (test-first)

**Files:** `src/App.jsx` (`handlePlanChange`) + plan `<select>` in
`src/components/PlanManager.jsx` + a **shared unsaved-draft confirmation helper**
(reused by Step 6).

**ACs covered:** "Plan switch dialog prompts appropriately"; "Dialog actions
execute corresponding operations"; protects "maximum one draft" by resolving the
draft when the user *leaves* the plan (design decision #5). Replaces the former
edit-time eviction warning.

**Write tests first** (browser):
- With **no draft**, switching to another plan loads it immediately (no dialog).
- With a draft, switching to a **different** plan opens a **Save / Discard and
  Continue / Cancel** dialog.
- **Cancel** → selection unchanged, draft intact, `<select>` shows the original
  plan.
- **Discard and Continue** → draft removed, the chosen plan loaded.
- **Save** → commits (or Save-As for a from-scratch draft), then loads the chosen
  plan.
- **Selecting the draft itself does not prompt** — it loads (via the Step 3
  just-loaded guard, so no second draft is forked).
- Switching to **"New Plan (Unsaved)"** while a draft exists prompts the same way
  (it, too, abandons the draft).

**Then implement:** factor a shared helper (e.g. `confirmDiscardDraft({ onSave,
onDiscard })` or an inline `openDialog` config builder) that both this step and
Step 6 use — one place that knows the three buttons and the commit-vs-Save-As
branch. In `handlePlanChange(newPlanId)`, `getDraft()`:
- No draft, **or** the target *is* the draft → switch/load as today.
- Draft exists and target differs → `openDialog` with three buttons:
  1. **Save** — Save flow (commit for a sourced draft, Save-As for from-scratch),
     then load the chosen plan.
  2. **Discard and Continue** (`variant: "danger"`) — `deleteDraft()`, then load.
  3. **Cancel** (`variant: "secondary"`) — do nothing.

**Watch out for:** the plan `<select>` is controlled by `currentPlanId`. Follow
the **`clearRow` pattern** (same as Step 6) — defer the actual load to inside the
confirm handlers; on Cancel you never call the load, so the dropdown snaps back on
its own. Verify `onChange` doesn't optimistically set state first. Selecting the
draft option must route through the just-loaded guard so it doesn't re-fork.

**Done when:** switching plans prompts only when a draft exists and the target is
a *different* plan, each button does the right thing, and returning to the draft
stays silent.

---

## Step 6 — Boss-switch confirmation dialog (test-first)

**Files:** `src/App.jsx` (`handleTimelineChange`) + boss `<select>` in
`src/components/TimelineControls.jsx`

**ACs covered:** "Boss change dialog prompts appropriately"; "Dialog actions
execute corresponding operations."

**Write tests first** (browser):
- With **no draft**, changing boss switches immediately (no dialog).
- With a draft, changing boss opens a **Save / Discard and Continue / Cancel**
  dialog.
- **Cancel** → boss unchanged, draft intact, `<select>` shows the original boss.
- **Discard and Continue** → draft removed, boss switched.
- **Save** → commits (or Save-As for a from-scratch draft), then switches.

**Then implement:** in `handleTimelineChange(newTimeline)`, `getDraft()`, and
**reuse the shared unsaved-draft confirmation helper from Step 5** (identical
three buttons; only the deferred action differs — switch boss vs. load plan):
- No draft → switch as today.
- Draft exists → `openDialog` with three buttons:
  1. **Save** — Save flow (commit for a sourced draft, Save-As for from-scratch),
     then proceed with the switch.
  2. **Discard and Continue** (`variant: "danger"`) — `deleteDraft()`, then
     switch.
  3. **Cancel** (`variant: "secondary"`) — do nothing.

**Watch out for:** the boss `<select>` is controlled by `currentTimeline`. Follow
the **`clearRow` pattern** — defer the actual switch to inside the confirm
handlers; on Cancel you never call `setCurrentTimeline`, so the dropdown snaps
back on its own. Verify `onChange` doesn't optimistically set state first.

**Done when:** boss switching prompts only when a draft exists and each button
does the right thing.

---

## Step 7 — Selector polish for the draft (test-first)

**File:** `src/components/PlanManager.jsx` (the `<select>`)

**ACs covered:** "Drafts remain selectable"; "Plan switching retains draft in
selector."

**Write tests first** (browser): the draft option is present, selecting it loads
it (via the just-loaded guard, so no second draft is forked), and re-selecting it
round-trips.

**Then implement:** confirm listing already works (it should, via prefix). Optional
polish: visually distinguish the draft option (italic / leading symbol). Not
required by the AC.

**Done when:** the draft is visible, selectable, and round-trips without spawning
duplicates.

---

## Step 8 — Full acceptance-criteria pass

Run `npm run test:run` (all green) and walk the issue's ACs manually in
`npm run dev`:

- [ ] Maximum one draft per localStorage instance
- [ ] Draft persists through app refresh (in storage/selector; not auto-loaded)
- [ ] Plan switching retains draft in selector
- [ ] New-name Save As creates a new plan, no draft left
- [ ] Same-name Save As replaces the existing plan
- [ ] Boss change dialog prompts appropriately (only when a draft exists)
- [ ] Plan switch dialog prompts appropriately (only when a draft exists and the
      target differs from the draft); returning to the draft stays silent
- [ ] Dialog actions (Save / Discard and Continue / Cancel) each execute correctly
- [ ] No drafts remain after Discard or Save-As

---

## Suggested commit / PR breakdown

Steps 1–2 are near-pure additions (safe to land first). Step 3 is the behavior
switch; Steps 4–7 build on it; Step 8 verifies. Per `CLAUDE.md`: tests land
**with or before** the code they cover, and **never edit a test to force a pass**
— if expected behavior genuinely changes, that's a human call.
