# Restore the last-viewed plan on load (future goal §1)

## Notes for the implementer

- **The code blocks below are signatures and JSDoc, not bodies.** Every `{ ... }` is an
  unwritten function — deliberate, so the implementation is written rather than transcribed.
  Nothing in this plan has been applied to the codebase yet.
- **`unsavedChangesProtection.test.jsx:450` needs a version string** in the
  retained-but-vacuous comment (see the Browser tests section). It isn't derivable from the
  repo — `package.json` is still `0.0.0` — so use the wording the author supplies rather
  than inventing one.

## Context

`usePlanSelection` boots to a hardcoded `"dancing-green"`, `currentPlanId: null`, empty
placements, and a literal default party comp. Everything about the previous session is
already sitting in `localStorage` — it's just never read at startup.

Two consequences, both in `.claude/plans/issue-7-future-goals.md` §1:

1. **The draft goes invisible.** The app maintains "if a draft exists, it is the current
   selection" in memory only, so a reload breaks the invariant. Note B in that doc is the
   sharp edge: after a reload `currentPlanId` is `null`, so the *first* edit takes
   `handleAutosave`'s fork branch → `saveDraft` → unconditional `deleteDraft()`, and last
   session's unsaved work is gone with no prompt. The fix has to land before any edit can
   happen, which is why this is a mount-time restore and not a lazy one.
2. **The boss is a placeholder.** `"dancing-green"` is hardcoded with a `// could perhaps
   be a LATEST_BOSS` comment, and there's no soft default behind it.

Outcome: on load the app returns to what you were last looking at — draft first, else the
last-viewed plan, with its boss, party comp, and placements. With nothing in storage it
falls back to a blank plan on the first boss in `BOSS_TIMELINES`, so "add an entry to
`BOSS_TIMELINES`, no other wiring needed" stays true.

**Why last-*viewed* rather than last-*modified*:** viewing is a superset of editing — any
plan you worked on you also had selected — and it fixes the case timestamps get wrong:
switch to a saved plan, don't edit it, reload, and you're back on it. `lastModified` stays
in `savePlan` untouched; it's simply not load-bearing for startup.

## Changes

### 1. Soft-code the default boss — `src/data/bossTimelines.js`

Add alongside `PIXELS_PER_SECOND` / `ROW_HEIGHT` / `PRE_PULL_TIMER_DURATION`:

```js
export const DEFAULT_BOSS_ID = Object.keys(BOSS_TIMELINES)[0];
```

### 2. Remember the selection — `src/utils/planStorage.js`

A last-viewed pointer to the current selection, stored under its own key — deliberately
**not** the `ffxiv-mit-plan-` prefix, so `getAllPlans` never picks it up as a plan:

```js
const LAST_VIEWED_KEY = "ffxiv-mit-last-viewed";

/**
 * Records the selection to restore on next load.
 * @param {string|null} planId - The selected plan, or null for "New Plan".
 * @param {string} bossId - The selected boss timeline. Only consulted on restore
 *   when planId is non-null - a blank "New Plan" always restores to
 *   DEFAULT_BOSS_ID rather than a remembered boss, so a boss that's since been
 *   removed can never resurface through a stale blank-state record.
 */
export function updateLastViewed({ planId, bossId }) { ... }

/**
 * Returns the last-viewed selection, or null if none was recorded (or the
 * record is unreadable). The plan it names may since have been deleted -
 * callers must verify (see getInitialSelection).
 * @returns {Object|null} - `{ planId, bossId }`, or null.
 */
export function getLastViewed() { ... }   // try/parse, null on malformed JSON
```

No `getMostRecentPlan`, no `lastModified` parsing.

### 3. Restore at mount, write through on change — `src/hooks/usePlanSelection.js`

- Hoist the inline default party comp out of `useState` to a module-level
  `DEFAULT_PARTY_COMP` const (unexported) so the initializer can fall back to it.
- Add a module-level `getInitialSelection()` with JSDoc, resolving in order:
  1. **`getDraft()`** — the invariant: a draft must never exist unselected. (Redundant in
     practice, since the fork sets `currentPlanId` to the draft and the last-viewed pointer
     follows, but it's one call and it's the rule the feature exists to enforce.)
  2. **`getLastViewed()`** — used only if it validates: `planId` must be non-null and must
     still `loadPlan` to something, and its `bossId` must be a key of `BOSS_TIMELINES`. A
     `planId` of `null` is never used to restore a boss — it falls straight through to blank
     (step 3), on `DEFAULT_BOSS_ID`, not the pointer's remembered `bossId`. A boss can't be
     meaningfully "remembered" once its owning plan is gone, and this is also exactly the
     shape a boss that's since been removed from `BOSS_TIMELINES` would take, so refusing to
     restore it here means a removed boss can never resurface through a blank New Plan.
  3. **blank** — `{ bossId: DEFAULT_BOSS_ID, planId: null, partyComp: DEFAULT_PARTY_COMP,
     placements: [] }`.

  The boss check in step 2 matters beyond tidiness: a plan on a boss that no longer exists
  leaves `timeline` undefined and `timeline.duration` throws. It's a single all-or-nothing
  check — a failing `bossId` discards the whole record rather than keeping the plan and
  falling back to `DEFAULT_BOSS_ID` for just the boss, which would restore a plan alongside a
  boss it was never on.
- Seed state from it, one lazy call, before first render:

```js
const [initialSelection] = useState(getInitialSelection); // lazy: runs once per mount
const [currentTimeline, setCurrentTimeline] = useState(initialSelection.bossId);
const [currentPlanId, setCurrentPlanId] = useState(initialSelection.planId);
const [placements, setPlacements] = useState(initialSelection.placements);
const [partyComp, setPartyComp] = useState(initialSelection.partyComp);
```

- Write the last-viewed pointer back from one effect rather than from each of the three sites that set
  `currentPlanId` (`applyPlanChange`, `applyTimelineChange`, `handleAutosave`'s fork), so a
  future fourth site can't forget to:

```js
// Write-through, not a subscription: one place, so every path that changes the
// selection is covered. Re-runs (StrictMode, restore-at-mount) rewrite the same value.
useEffect(() => {
  updateLastViewed({ planId: currentPlanId, bossId: currentTimeline });
}, [currentPlanId, currentTimeline]);
```

- Delete the now-stale `// Uses a default "dancing-green" boss for now...` comment.

No changes to `applyPlanChange`, `handleAutosave`, `handleSave`, or `PlanManager` —
`PlanManager` reads storage on its own render, so the seeded `currentPlanId` resolves to the
right `<option>` on the first paint.

## Tests

### Unit — `tests/unit/planStorage.test.js`, new `describe` for the last-viewed pointer

- `getLastViewed` returns null when nothing was ever recorded
- `updateLastViewed` → `getLastViewed` round-trips `planId` and `bossId`, including a null
  `planId`
- a malformed record returns null rather than throwing
- **the last-viewed pointer is not visible to `getAllPlans` / `getPlansByBoss` / `getDraft`**
  — a regression test proving `planStorage.js`'s key-namespace separation, the one way this
  could quietly corrupt the plan list

### Browser — `tests/browser/unsavedChangesProtection.test.jsx`

Port `getSlotSelect` from `MitigationPlanner.test.jsx:115` for the party-comp assertion, and
query the boss selector via its `Boss:` label / `boss-select` id.

**Invert the existing test at :131** — under the new behavior a draft *is* auto-loaded, so
it becomes "a draft created before mount is selected on remount, with its placements on
screen", keeping the unmount/remount round-trip it already exercises.

**Leave :450 as-is**, with a one-line comment above it noting the expectation is now vacuous
but retained so the behavior can't regress. (Its single seeded plan is auto-selected at
mount, so the "switch" it performs is a no-op.) The version string in that comment is yours
to pick — `package.json` still says `0.0.0`, so I'll use your wording verbatim unless you
say otherwise.

**New `describe("startup restore")`** — driven through the real unmount/remount cycle
(`render` → interact → `unmount` → `render`) rather than by seeding the last-viewed pointer
directly, so each test covers the write-through and the restore together, except where the
state under test has no UI path to it at all (see below):

- viewing a saved plan without editing it, then remounting, restores that plan with its
  placements, party comp, and boss (seed it on `"ultimate-boss"` with a non-default `tank1`
  job, so every restored field is distinguishable from the defaults — this is the case
  last-modified would get wrong)
- a draft is preferred even when the last-viewed pointer names a different plan
- with empty storage, boots to "New Plan" on the first boss in `BOSS_TIMELINES`
- a last-viewed pointer naming a since-deleted plan boots to the blank default without
  crashing (remove the key directly, as at `:411`)
- a last-viewed pointer with a `null` planId falls back to `DEFAULT_BOSS_ID`, not the boss it
  was recorded with, staying on "New Plan" — reachable through the UI (switch boss on a blank
  New Plan, unmount, remount) since a null-`planId` record is never trusted for its boss
- a last-viewed pointer naming a boss no longer in `BOSS_TIMELINES` is ignored *entirely* —
  not just the boss, the plan too — seed a real plan, then call `updateLastViewed` directly
  with that plan's id and a bogus `bossId`, since the record's `bossId` otherwise never drifts
  from its plan's own `bossId` and there's no in-app way to desync them

## Verification

```bash
npm run test:unit    # the last-viewed pointer
npm run test:int     # browser suite - watch for fallout beyond :131
npm run lint         # no new warnings; the effect's deps are exhaustive
npm run dev
```

Manual pass in `npm run dev`: place an ability (creates a draft) → hard-reload → the draft is
selected with its placements and boss. Save it, switch to another plan without editing,
reload → that plan comes back. Switch boss on a blank New Plan, reload → back on the default
boss, not the one just switched to, still blank. Finally `localStorage.clear()` in the
console and reload → "New Plan" on the first boss listed in the selector.

**Existing-test fallout check:** `renderOnDraft` and the seed-then-`selectPlan` tests keep
passing — the mount restore lands on the same selection they were selecting manually, and
React suppresses a synthetic `onChange` when the `<select>`'s value is unchanged, so the
redundant `selectPlan` is a genuine no-op rather than a second `handlePlanChange`. If any
test does prompt unexpectedly, that's a real finding, not test noise — flag it rather than
adjusting the test.
