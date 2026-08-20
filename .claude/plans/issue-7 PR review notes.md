# Issue #7 (PR #25) — Review Notes

Findings from the review of PR #25 that were **not** fixed in the PR itself and
do not belong to issue #24. Ordered by how structural the root cause is, not by
urgency — each item notes its own.

The two data-loss findings (draft destroyed on a post-reload "Save and
Continue"; draft destroyed by the first edit after a reload) live in
`issue-7-future-goals.md` §1, since restoring the draft on load is what closes
them.

## Conventions and smaller items

- **`src/utils/openSaveAsDialog.js` builds React elements via `createElement`**
  to stay a `.js` file. A React-element factory isn't really a utility —
  `src/components/dialog/` as `.jsx` with real JSX would read better and match
  the file-extension convention.
- **`confirmDiscardDraft` is asymmetric about closing.** `onDiscard` callers
  call `closeDialog()` explicitly; `onSave` relies on `handleSave` always
  replacing the dialog with either "Plan saved!" or Save As. True today, but an
  unstated coupling — either close inside `confirmDiscardDraft`'s own handlers
  or document why Save must not.
- **`handleSave` opens the "Plan saved!" dialog and then calls `afterSave`**,
  which on the import path opens the file picker over it. Ordering nit.
- **`commitDraft` writes `isDraft: false, sourcePlanId: null`** onto finalized
  plans rather than deleting the keys. Fine, and pinned by a test — just schema
  noise on plans that were never drafts.
- **JSDoc:** `confirmDiscardDraft`'s `body` has a default but isn't documented
  as `[body]`.

## Testing

- **`getBossSelect()` in `unsavedChangesProtection.test.jsx`** reaches through
  `.closest("div").querySelector("select")`, coupling the test to the controls'
  DOM nesting. A `data-testid` or an accessible label on the select would be
  sturdier, per the project's own testid guidance ("an inert seam, not a
  behavior change").
- **Coverage gap matching the findings above:** no test constructs the state
  where `currentPlanId` and `getDraft()` disagree. Worth adding alongside issue
  #24 — a draft in storage while `currentPlanId` is `null` (i.e. post-reload),
  then a plan switch → "Save and Continue"; and a draft belonging to a boss
  other than the current one. The narrower "selection points at a plan that no
  longer exists" case is now covered ("on a selection whose plan no longer
  exists, routes through Save As…"), which reaches the state by deleting the
  key directly since no in-app path produces it.
