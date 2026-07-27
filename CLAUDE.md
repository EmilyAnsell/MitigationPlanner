# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start local dev server (Vite, hot reload)
npm run build     # production build → dist/
npm run lint      # ESLint
npm run deploy    # build + push to GitHub Pages
npm run test      # run all tests (Vitest, watch mode)
npm run test:run  # run all tests once (CI)
npm run test:ui   # Vitest UI, useful for debugging
npm run test -- tests/unit/cooldownCalculations.test.js  # single file
npm run test -- --project unit                           # one project only
npm run test:unit # alias to run unit tests only, once
npm run test:int  # alias to run integration tests only, once
```

### Tests

Testing uses **Vitest**. Two projects are configured in `vitest.config.js`:

- **`unit`** — `tests/unit/**/*.test.js`, `node` environment. For utilities, hooks, and data (`src/utils`, `src/hooks`, `src/data`).
- **`browser`** — `tests/browser/**/*.test.jsx`, real Firefox via `@vitest/browser-playwright` + React Testing Library. For React components. Browser test files are `.jsx` because they contain JSX, and the project carries its own `plugins: [react()]` **at the project level** (a sibling of `test`, not inside it).

`tests/unit/cooldownCalculations.test.js` is the reference example for testing a utility file. Follow its conventions:

- **Globals are enabled** (`globals: true`) — use `describe`, `test`, `expect`, `beforeEach`/`afterEach`, and `vi` directly. Import only the functions under test.
- **One top-level `describe` per exported function.** Test names state the condition and expected result (e.g. "no conflict when ability is placed outside of cooldown of a placed ability").
- **`test.each` for pure input→output mappings** — prefer the object-table form with a `$description` in the title. Use separate `test` blocks when cases need different setup or assertions.
- **Mock sibling modules with `vi.mock`**, and reset in an `afterEach` with `vi.resetAllMocks()` (resets return values; `clearAllMocks` only clears call history) so a mocked return value from one test can't leak into the next.
- **Cover boundaries and edge cases** — exact cooldown end, pre-pull (negative) times, zero/null durations, multi-charge recharge.
- **Test the reachable domain; pin invariants at the layer that enforces them.** e.g. placements past the timeline end are rejected in `useDragPlacement`, so `getEffectiveDuration` is not tested for that unreachable input.
- Do not edit the code being tested when writing tests, especially not in order to make a test pass. If you find a bug, flag it in an issue, write a test for the expected behavior, and fix the bug in a separate PR.

`tests/browser/MitigationPlanner.test.jsx` is the reference example for a component/integration test in a real browser. Follow its conventions:

- **Mount with `render(<App />)`** from `@testing-library/react`; you rarely need its return value. **Query and interact through `page`** (from `@vitest/browser/context`, re-exported by `vitest/browser`) rather than RTL's `screen`.
- **Locators are lazy, retrying descriptions, not elements.** Assert with an awaited `await expect.element(locator).toBeInTheDocument()` — the `await` is mandatory: it is what retries until the DOM settles, and an unawaited `expect.element` passes vacuously. (This is why browser tests are `async` while unit tests are synchronous — they observe rendered DOM, not return values.)
- **Bridge a locator to a real DOM node with `.element()`** when you need to hand it to `fireEvent` or a DOM API like `.closest()`.
- **Prefer semantic queries** (`getByText`, `getByRole`, `getByAltText`). Add a `data-testid` only when an element has no accessible handle (e.g. the timeline drop-zone) — a testid is an inert seam, not a behavior change.
- **Drive HTML5 drag-and-drop with `fireEvent`, not real mouse / `userEvent`** — Playwright cannot synthesize native drag events. Fire the lifecycle in order: `dragStart` → `dragOver` (with a `clientX`) → `drop`. `dragOver` builds the preview that `drop` reads (skip it and the drop is a no-op); `drop`, not `dragEnd`, commits the placement. This app keeps the dragged ability in React state (not `dataTransfer`), so no `dataTransfer` faking is needed.
- **Isolate with `afterEach(() => { cleanup(); localStorage.clear(); })`** — `cleanup` unmounts prior trees so queries don't match two mounts, and clearing `localStorage` stops App's auto-save from leaking state between tests.
- **Prefer executable checks over comments when something can break silently** — but don't assert a precondition a throwing lookup already enforces (`getByText`/`getByTestId` blow up if the default party comp changes). Comment the assumed defaults to explain _why_ the lookups resolve; reserve assertions for what nothing else would catch.
- **DRY for tests** — once a fact has a dedicated test that owns it (e.g. a future "renders the default party composition" test), rely on it rather than re-asserting it here.

## Architecture

The app is a single-page React tool for planning FFXIV mitigation cooldowns against a boss attack timeline. There is no backend; all state is managed in React and persisted to `localStorage`.

### State ownership

All core state lives in `App.jsx` (`MitigationPlanner` component):

- `partyComp` — 8-slot party (`tank1`/`tank2`/`healer1`/`healer2`/`dps1-4`), each mapped to a job ID
- `placements` — array of placed abilities on the timeline; each entry extends an ability object with `startTime` and a unique `placementId`
- `draggedAbility`, `draggedFrom`, `dragPreview`, `dragOffset`, `isDraggingOnTimeline` — drag-and-drop in-flight state
- `currentTimeline` — key into `BOSS_TIMELINES`
- `zoom` — multiplier applied to `PIXELS_PER_SECOND` for timeline scaling

### Data layer (`src/data/`)

- **`jobs.js`** — `JOBS` object keyed by job ID (e.g. `"PLD"`). Each job has `name`, `role`, `color`, `icon`, and `abilities[]`. Role abilities (Rampart, Reprisal, Feint, etc.) are defined once in `ROLE_ABILITIES_RAW` and merged into each job via `processRoleAbilities`. Ability icons are attached via `assignIcons` at module load time.
- **`bossTimelines.js`** — `BOSS_TIMELINES` keyed by encounter ID. Each timeline has `name`, `duration` (seconds), and `attacks[]` (time + name + type). `PIXELS_PER_SECOND` is the base rendering constant (scaled by zoom).

### Utility layer (`src/utils/`)

- **`cooldownCalculations.js`** — `checkCooldownConflict` determines whether placing an ability at a given time conflicts with existing placements. Handles both single-charge and multi-charge (simulated) abilities. `getAbilitiesForSlot` resolves which abilities are available for a given party slot.
- **`validDropZones.js`** — `calculateValidDropZones` returns the time ranges where a given ability can legally be placed (inverse of blocked cooldown windows). `snapToValidZone` snaps a drag position to the nearest valid boundary within a 2-second threshold.
- **`planStorage.js`** — `localStorage` CRUD for saved plans, keyed with prefix `ffxiv-mit-plan-`. Also handles JSON import/export.
- **`iconLoader.js`** — uses Vite's `import.meta.glob` to bulk-import all PNGs from `src/assets/icons/` at build time, keyed by filename stem (ability ID or job ID).
- **`abilityHelpers.js`** / **`laneCalculations.js`** — helpers for icon assignment and label stacking on the timeline.

### Hooks (`src/hooks/`)

- **`useTimelinePan.js`** — scroll-wheel horizontal panning
- **`useTimelineZoom.js`** — scroll-wheel zoom

### Component structure

`Timeline.jsx` is the most complex component. It renders one `TimelineRow` per party slot, overlays boss attack markers (`TimeMarkers`), and hosts drag event handlers passed down from `App`. Sub-components under `src/components/timeline/` handle specific concerns: `ValidDropZones` (visual shading during drag), `DragPreview` (ghost ability), `DragTooltip` (timestamp on drag), `AbilityTooltip` (hover info), `PartyList`.

### Adding a new boss timeline

Add an entry to `BOSS_TIMELINES` in `src/data/bossTimelines.js` following the existing shape. No other wiring is needed.

### Adding a new job or ability

Add the job to `JOBS` in `src/data/jobs.js`. Drop the ability icon PNG into `src/assets/icons/abilities/<JOB>/` — `iconLoader.js` picks it up automatically by filename stem matching the ability `id`.

### Alerts and Confirmation Dialogs

- **Avoid `alert()`/`confirm()`**: use custom Dialog found in Dialog.jsx, accessed anywhere with dialogStore.js openDialog(). Use the body to explain the purpose of the dialog and feed the buttons with meaningful-but-succinct labels and onClick functionality, typically in a custom () => {} function performing whatever you need the button to do.

## Style conventions

### What the codebase does consistently

- **Components**: `export default function ComponentName` — never arrow functions for component definitions
- **Public utilities and hooks**: `export function` (e.g., `checkCooldownConflict`, `useTimelineZoom`)
- **Private module-level helpers** in utility files: `function` declarations (e.g., `simulateChargeUsage`, `mergeRanges`, `calculateSimpleValidZones`) — not arrow functions
- **Component-internal handlers**: `const` arrow functions (`const handleSave = () => ...`)
- **Props**: always destructured in the function signature, never accessed via a `props` param. always prefix unused props with `_` to avoid ESLint warnings (e.g. `(_ability)` in `snapToValidZone`) and use '\_' for ignored function parameters as is javascript convention.
- **JSDoc for non-trivial functions**: a one-line summary followed by `@param {type} name - description` per parameter and `@returns {type} - description` (see `abilityHelpers.js`, `cooldownCalculations.js`, `iconLoader.js`, `useDragPlacement.js`). For a destructured object parameter, document each destructured field as its own flat `@param` (e.g. `@param {number} time - ...`) — do not nest under a `params.field` object wrapper.
- **Styling**: Tailwind classes for static styles; inline `style={{}}` only for values that require JS computation (positions, widths, colors from data). Never use inline style for something expressible as a Tailwind class.
- **File extensions**: `.jsx` for React components, `.js` for everything else (hooks, utils, data)
- **Exports**: named exports for utilities/data; default export for components
- **Test coverage**: Unit and e2e tests are new to this project. Not everything needs to be covered now, but when planning to touch a component or function it must have existing tests in place before modifying the code to be tested.
- **Test editing**: Never edit or remove a test when working on core code changes in order to make a failing test pass. If the expected functionality of something being tested is being changed, rely on a human developer to make the call to modify tests.

### Suggested conventions not yet consistently applied

- **Don't pass raw state setters as props** — `TimelineRow` receives `setHoveredAbility` and `setTooltipPosition` directly. Prefer wrapping in a named handler at the call site (`onHoverAbility`) so components don't take implicit ownership of parent state.

- **Extract magic numbers to named constants** — values like `labelWidth = 128`, the `snapThreshold = 2` in `validDropZones.js`, and the `laneHeight` arithmetic in `TimelineRow` should be named constants alongside `ROW_HEIGHT` and `PIXELS_PER_SECOND` in `bossTimelines.js`.

- **`useMemo` with `[]` deps belongs at module scope** — `getJobsByCategory` in `PartyComposition.jsx` is memoized with an empty dependency array, making it equivalent to a constant. Move it outside the component as a module-level `const`.
