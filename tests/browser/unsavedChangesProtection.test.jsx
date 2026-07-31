import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import App from "../../src/App.jsx";
import { getJobAbilities } from "../../src/data/jobs";
import {
  saveDraft,
  savePlan,
  generatePlanId,
  getDraft,
  getAllPlans,
  loadPlan,
} from "../../src/utils/planStorage";

// Matches App's default partyComp - kept in sync manually since App doesn't export it.
const DEFAULT_PARTY_COMP = {
  tank1: "PLD",
  tank2: "WAR",
  healer1: "AST",
  healer2: "SCH",
  dps1: "DRG",
  dps2: "RDM",
  dps3: "BRD",
  dps4: "PCT",
};

// Seeds a draft directly via the storage layer (bypassing the auto-save fork,
// which Step 3 hasn't implemented yet) so these tests exercise only what Step 2
// covers: the draft round-tripping through the selector and remounts.
// TODO(step-3): once the auto-save fork lands, drafts are normally created by
// editing a loaded plan. This helper will still be useful to seed a draft without
// driving an edit through the UI.
function seedDraft(placements = [], overrides = {}) {
  return saveDraft({
    bossId: "dancing-green",
    planName: "New Plan",
    partyComp: DEFAULT_PARTY_COMP,
    placements,
    sourcePlanId: null,
    ...overrides,
  });
}

// Loads a plan/draft via PlanManager's plan selector - the app's only seam for
// putting placements into state without a UI drag. Must be called with a
// planId that already exists in storage before render (see seedDraft
// above) - PlanManager only re-reads localStorage on its own render.
function selectPlan(planId) {
  const planSelect = page
    .getByText("New Plan (Unsaved)")
    .element()
    .closest("select");
  fireEvent.change(planSelect, { target: { value: planId } });
}

function getPlanSelect() {
  return page.getByText("New Plan (Unsaved)").element().closest("select");
}

/* Drags an ability from the palette onto a party slot's timeline row - the app's
only UI seam for making a "genuine edit" that runs through editPlacements (and
therefore handleAutosave), same technique as MitigationPlanner.test.jsx. Relies on
the same default preconditions as that file: partyComp.tank1 = "PLD" and
selectedSlot = "tank1", so the palette renders Paladin's abilities and the tank1
drop zone exists. */
function placeAbility(abilityName, dropZoneTestId, clientXOffset = 40) {
  const paletteAbility = page
    .getByText(abilityName)
    .element()
    .closest('[draggable="true"]');
  const dropZone = page.getByTestId(dropZoneTestId).element();
  const rect = dropZone.getBoundingClientRect();

  fireEvent.dragStart(paletteAbility);
  fireEvent.dragOver(dropZone, { clientX: rect.left + clientXOffset });
  fireEvent.drop(dropZone);
}

describe("draft persistence and selection", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  test("a draft created before mount survives unmount and remount, and is not auto-loaded", async () => {
    seedDraft();

    const { unmount } = render(<App />);
    await expect
      .element(page.getByText("New Plan (draft)"))
      .toBeInTheDocument();
    unmount();

    render(<App />);

    const planSelect = page
      .getByText("New Plan (Unsaved)")
      .element()
      .closest("select");
    expect(planSelect.value).toBe("");
    await expect
      .element(page.getByText("New Plan (draft)"))
      .toBeInTheDocument();
  });

  test("selecting the draft from the selector loads its placements", async () => {
    const rampart = getJobAbilities("PLD").find((a) => a.id === "rampart");
    const draftId = seedDraft([
      { ...rampart, slot: "tank1", startTime: 0, placementId: "seed-1" },
    ]);

    render(<App />);
    selectPlan(draftId);

    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
  });

  test("switching to a different plan removes the draft", async () => {
    seedDraft();
    const otherPlanId = generatePlanId("dancing-green", "Other Plan");
    savePlan(otherPlanId, {
      bossId: "dancing-green",
      planName: "Other Plan",
      partyComp: DEFAULT_PARTY_COMP,
      placements: [],
    });

    render(<App />);
    await expect
      .element(page.getByText("New Plan (draft)"))
      .toBeInTheDocument();

    // TODO(step-5): this silent loss is exactly what the Save/Discard/Cancel
    // confirmation dialog will prevent - once it lands, this switch opens
    // that dialog instead, and only "Discard and Continue" reaches the
    // deletion this test exercises directly today.
    selectPlan(otherPlanId);

    await expect.element(page.getByText("Other Plan")).toBeInTheDocument();
    await expect
      .element(page.getByText("New Plan (draft)"))
      .not.toBeInTheDocument();
    expect(getDraft()).toBe(null);
  });
});

// Step 3: handleAutosave forks a draft on a genuine edit instead of overwriting
// a finalized plan. Unlike the describe block above (which seeds drafts directly
// via saveDraft to test round-tripping), these tests drive a real edit through
// the UI so the fork itself - the behavior handleAutosave is responsible for -
// is what's under test.
describe("draft-aware auto-save (the fork)", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  function draftCount() {
    return Object.values(getAllPlans()).filter((plan) => plan.isDraft === true)
      .length;
  }

  test("editing a loaded saved plan forks a `<name> (draft)` pointing at the source, switches selection to it, and leaves the source untouched", async () => {
    const fooId = generatePlanId("dancing-green", "Foo");
    savePlan(fooId, {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: DEFAULT_PARTY_COMP,
      placements: [],
    });

    render(<App />);
    const planSelect = getPlanSelect();
    selectPlan(fooId);
    await expect.poll(() => planSelect.value).toBe(fooId);

    placeAbility("Holy Sheltron", "dropzone-tank1");

    await expect.element(page.getByText("Foo (draft)")).toBeInTheDocument();
    const draft = getDraft();
    expect(draft.sourcePlanId).toBe(fooId);
    expect(draft.planName).toBe("Foo (draft)");
    await expect.poll(() => planSelect.value).toBe(draft.planId);

    expect(loadPlan(fooId)).toMatchObject({
      planName: "Foo",
      placements: [],
    });
  });

  test("continuing to edit right after the fork updates the same draft rather than creating a second one", async () => {
    const fooId = generatePlanId("dancing-green", "Foo");
    savePlan(fooId, {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: DEFAULT_PARTY_COMP,
      placements: [],
    });

    render(<App />);
    selectPlan(fooId);
    await expect.poll(() => getPlanSelect().value).toBe(fooId);

    placeAbility("Holy Sheltron", "dropzone-tank1", 40);
    await expect.element(page.getByText("Foo (draft)")).toBeInTheDocument();

    // Well past Holy Sheltron's cooldown window so this second drop can't be
    // rejected as a conflict - only the "still one draft" behavior is under test.
    placeAbility("Rampart", "dropzone-tank1", 300 * 4);
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();

    expect(draftCount()).toBe(1);
    const draft = getDraft();
    expect(draft.sourcePlanId).toBe(fooId);
    expect(draft.planName).toBe("Foo (draft)");
  });

  test("editing an already-selected draft (loaded via the selector, not just-forked) updates it in place, keeping exactly one draft with its name/source unchanged", async () => {
    const fooId = generatePlanId("dancing-green", "Foo");
    savePlan(fooId, {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: DEFAULT_PARTY_COMP,
      placements: [],
    });
    const draftId = saveDraft({
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: DEFAULT_PARTY_COMP,
      placements: [],
      sourcePlanId: fooId,
    });

    render(<App />);
    selectPlan(draftId);
    await expect.poll(() => getPlanSelect().value).toBe(draftId);

    placeAbility("Holy Sheltron", "dropzone-tank1");
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();

    expect(draftCount()).toBe(1);
    const draft = getDraft();
    expect(draft.planId).toBe(draftId);
    expect(draft.sourcePlanId).toBe(fooId);
    expect(draft.planName).toBe("Foo (draft)");
  });

  test("editing from `New Plan (Unsaved)` forks a `New Plan (draft)` with no source", async () => {
    render(<App />);

    placeAbility("Holy Sheltron", "dropzone-tank1");

    await expect
      .element(page.getByText("New Plan (draft)"))
      .toBeInTheDocument();
    const draft = getDraft();
    expect(draft.sourcePlanId).toBe(null);
    expect(draft.planName).toBe("New Plan (draft)");
  });

  test("loading a saved plan and switching to another without editing creates no draft", async () => {
    const fooId = generatePlanId("dancing-green", "Foo");
    savePlan(fooId, {
      bossId: "dancing-green",
      planName: "Foo",
      partyComp: DEFAULT_PARTY_COMP,
      placements: [],
    });
    const barId = generatePlanId("dancing-green", "Bar");
    savePlan(barId, {
      bossId: "dancing-green",
      planName: "Bar",
      partyComp: DEFAULT_PARTY_COMP,
      placements: [],
    });

    render(<App />);
    const planSelect = getPlanSelect();

    selectPlan(fooId);
    await expect.poll(() => planSelect.value).toBe(fooId);

    selectPlan(barId);
    await expect.poll(() => planSelect.value).toBe(barId);

    expect(getDraft()).toBe(null);
  });
});
