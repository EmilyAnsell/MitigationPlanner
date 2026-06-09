# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # start local dev server (Vite, hot reload)
npm run build     # production build → dist/
npm run lint      # ESLint
npm run deploy    # build + push to GitHub Pages
```

No test suite exists yet. The recommended stack for adding tests is **Vitest + React Testing Library** (see below).

### Adding tests (when set up)

```bash
npm run test           # run all tests
npm run test -- path/to/file.test.js  # run a single test file
```

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

## Style conventions

### What the codebase does consistently

- **Components**: `export default function ComponentName` — never arrow functions for component definitions
- **Public utilities and hooks**: `export function` (e.g., `checkCooldownConflict`, `useTimelineZoom`)
- **Private module-level helpers** in utility files: `function` declarations (e.g., `simulateChargeUsage`, `mergeRanges`, `calculateSimpleValidZones`) — not arrow functions
- **Component-internal handlers**: `const` arrow functions (`const handleSave = () => ...`)
- **Props**: always destructured in the function signature, never accessed via a `props` param
- **Styling**: Tailwind classes for static styles; inline `style={{}}` only for values that require JS computation (positions, widths, colors from data). Never use inline style for something expressible as a Tailwind class.
- **File extensions**: `.jsx` for React components, `.js` for everything else (hooks, utils, data)
- **Exports**: named exports for utilities/data; default export for components

### Suggested conventions not yet consistently applied

- **Drop `import React`** — Vite's `@vitejs/plugin-react` uses the automatic JSX runtime, so `import React from "react"` is unnecessary boilerplate in every component file. Only import specific hooks (`useState`, `useMemo`, etc.) as needed.

- **Don't pass raw state setters as props** — `TimelineRow` receives `setHoveredAbility` and `setTooltipPosition` directly. Prefer wrapping in a named handler at the call site (`onHoverAbility`) so components don't take implicit ownership of parent state.

- **Extract magic numbers to named constants** — values like `labelWidth = 128`, the `snapThreshold = 2` in `validDropZones.js`, and the `laneHeight` arithmetic in `TimelineRow` should be named constants alongside `ROW_HEIGHT` and `PIXELS_PER_SECOND` in `bossTimelines.js`.

- **`useMemo` with `[]` deps belongs at module scope** — `getJobsByCategory` in `PartyComposition.jsx` is memoized with an empty dependency array, making it equivalent to a constant. Move it outside the component as a module-level `const`.

- **Avoid `alert()`/`confirm()`** — `PlanManager.jsx` and `App.jsx` use blocking browser dialogs for save confirmations and clear-all. These should be replaced with inline UI (a confirmation state or a small modal).
