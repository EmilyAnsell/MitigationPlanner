import { act } from "react";
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
import { closeDialog } from "../../src/utils/dialogStore";

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

// Seeds a draft directly via the storage layer, bypassing the auto-save fork, so
// tests that are about what happens *to* an existing draft don't have to drive an
// edit through the UI first. The fork itself is covered separately, below.
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

// Builds a placement of the same shape useDragPlacement produces, so a plan or
// draft can be seeded in storage with visible content without driving a drag.
function pldPlacement(abilityId, startTime = 0) {
  const ability = getJobAbilities("PLD").find((a) => a.id === abilityId);
  return {
    ...ability,
    slot: "tank1",
    startTime,
    placementId: `seed-${abilityId}-${startTime}`,
  };
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

// Seeds a finalized (non-draft) plan for the boss the app boots to.
function seedPlan(planName, placements = []) {
  const planId = generatePlanId("dancing-green", planName);
  savePlan(planId, {
    bossId: "dancing-green",
    planName,
    partyComp: DEFAULT_PARTY_COMP,
    placements,
  });
  return planId;
}

// Save As and import both mint their plan id from Date.now(), so tests that need
// the resulting id have to look it up by the name they gave it.
function findPlanIdByName(planName) {
  const entry = Object.entries(getAllPlans()).find(
    ([_, plan]) => plan.planName === planName,
  );
  return entry ? entry[0] : null;
}

/* Scopes a query to a button inside the open dialog. The unsaved-draft dialog is
identified by its three buttons rather than its wording - the labels are the part
of it the acceptance criteria name. */
function dialogButton(name) {
  return page.getByRole("dialog").getByRole("button", { name });
}

// Puts the app on an existing draft, the state a user is in when they reach for
// the boss selector, the plan selector, or Import with unsaved work in hand.
async function renderOnDraft(placements = [], overrides = {}) {
  const draftId = seedDraft(placements, overrides);
  render(<App />);
  selectPlan(draftId);
  await expect.poll(() => getPlanSelect().value).toBe(draftId);
  return draftId;
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
    closeDialog();
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
});

// Step 3: handleAutosave forks a draft on a genuine edit instead of overwriting
// a finalized plan. Unlike the describe block above (which seeds drafts directly
// via saveDraft to test round-tripping), these tests drive a real edit through
// the UI so the fork itself - the behavior handleAutosave is responsible for -
// is what's under test.
describe("draft-aware auto-save (the fork)", () => {
  afterEach(() => {
    cleanup();
    closeDialog();
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

/* Step 5: leaving a plan while a draft exists is confirmed rather than silent.
The dialog is raised inside usePlanSelection.handlePlanChange - PlanManager's
<select> only reports the new selection - so it is driven here through <App />,
where the deferred load, the draft in storage, and the <select>'s own value are
all observable at once. */
describe("plan-switch confirmation dialog", () => {
  afterEach(() => {
    cleanup();
    // The dialog store lives outside React, so a dialog left open by one test
    // would still be open on the next test's first render.
    closeDialog();
    localStorage.clear();
  });

  /* On a draft holding one Rampart, with a separate empty plan to switch to.
  Rampart is on the draft and not on "Other Plan", so whether it is on screen
  says which of the two is currently loaded. */
  async function renderOnDraftWithOtherPlan() {
    const otherId = seedPlan("Other Plan");
    const draftId = await renderOnDraft([pldPlacement("rampart")]);
    return { draftId, otherId };
  }

  test("with no draft, switching to another plan loads it immediately without prompting", async () => {
    const otherId = seedPlan("Other Plan", [pldPlacement("rampart")]);

    render(<App />);
    selectPlan(otherId);

    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(getPlanSelect().value).toBe(otherId);
  });

  test("switching to a different plan while a draft exists prompts and switches nothing yet", async () => {
    const { draftId, otherId } = await renderOnDraftWithOtherPlan();

    selectPlan(otherId);

    await expect.element(dialogButton("Save")).toBeInTheDocument();
    await expect
      .element(dialogButton("Discard and Continue"))
      .toBeInTheDocument();
    await expect.element(dialogButton("Cancel")).toBeInTheDocument();
    expect(getDraft().planId).toBe(draftId);
    // Still the draft's content on screen - the load is deferred until answered.
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
  });

  test("Cancel leaves the draft intact and the selection where it was", async () => {
    const { draftId, otherId } = await renderOnDraftWithOtherPlan();
    selectPlan(otherId);

    fireEvent.click(dialogButton("Cancel").element());

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(getDraft().planId).toBe(draftId);
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
    /* The <select> is controlled by currentPlanId, which Cancel never changes, so
    the dropdown snaps back to the draft on its own - no restore code needed. */
    await expect.poll(() => getPlanSelect().value).toBe(draftId);
  });

  test("Discard and Continue removes the draft and loads the chosen plan", async () => {
    const { otherId } = await renderOnDraftWithOtherPlan();
    selectPlan(otherId);

    fireEvent.click(dialogButton("Discard and Continue").element());

    await expect.poll(() => getPlanSelect().value).toBe(otherId);
    expect(getDraft()).toBe(null);
    await expect
      .element(page.getByText("New Plan (draft)"))
      .not.toBeInTheDocument();
    await expect.element(page.getByAltText("Rampart")).not.toBeInTheDocument();
  });

  test("Save on a sourced draft commits it onto its source plan, then loads the chosen plan", async () => {
    const fooId = seedPlan("Foo");
    const otherId = seedPlan("Other Plan");
    const draftPlacements = [pldPlacement("rampart")];
    await renderOnDraft(draftPlacements, {
      planName: "Foo",
      sourcePlanId: fooId,
    });

    selectPlan(otherId);
    fireEvent.click(dialogButton("Save").element());

    await expect.poll(() => getPlanSelect().value).toBe(otherId);
    expect(getDraft()).toBe(null);
    expect(loadPlan(fooId)).toMatchObject({
      planName: "Foo",
      placements: draftPlacements,
    });
  });

  test("Save on a from-scratch draft routes through Save As, and the chosen plan loads only once a name is given", async () => {
    const { otherId } = await renderOnDraftWithOtherPlan();
    selectPlan(otherId);

    fireEvent.click(dialogButton("Save").element());

    await expect.element(page.getByText("Save Plan As")).toBeInTheDocument();
    // Nothing is committed and nothing is loaded while the name is outstanding.
    expect(getPlanSelect().value).not.toBe(otherId);
    expect(getDraft()).not.toBe(null);

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Named Plan" } });
    fireEvent.click(dialogButton("Save").element());

    await expect.poll(() => getPlanSelect().value).toBe(otherId);
    expect(getDraft()).toBe(null);
    expect(loadPlan(findPlanIdByName("Named Plan"))).toMatchObject({
      placements: [pldPlacement("rampart")],
    });
  });

  test("selecting the draft itself does not prompt - it is a return, not an abandonment", async () => {
    const draftId = seedDraft([pldPlacement("rampart")]);
    seedPlan("Other Plan");

    render(<App />);
    selectPlan(draftId);

    await expect.poll(() => getPlanSelect().value).toBe(draftId);
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(getDraft().planId).toBe(draftId);
  });

  test("switching to New Plan (Unsaved) while a draft exists prompts the same way", async () => {
    const draftId = await renderOnDraft([pldPlacement("rampart")]);

    selectPlan("");

    await expect
      .element(dialogButton("Discard and Continue"))
      .toBeInTheDocument();
    expect(getDraft().planId).toBe(draftId);

    fireEvent.click(dialogButton("Discard and Continue").element());

    await expect.poll(() => getPlanSelect().value).toBe("");
    expect(getDraft()).toBe(null);
    await expect.element(page.getByAltText("Rampart")).not.toBeInTheDocument();
  });
});

/* Step 5, second half: Import abandons the draft exactly like any other plan
switch, so it raises the same dialog - but on the button, *before* the OS file
picker opens, since the app gets no event when a picker is dismissed. The picker
is opened by fileInputRef.current.click(), so a spy on HTMLInputElement.prototype
is both the only way to observe when it opens and the only way to keep a real
native dialog from opening mid-test. */
describe("import confirmation dialog", () => {
  let openPicker;

  beforeEach(() => {
    openPicker = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    closeDialog();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function clickImport() {
    fireEvent.click(page.getByTitle("Import").element());
  }

  /* Hands a file to the hidden <input type="file"> directly. The Import button
  only opens the picker (stubbed above), and a test can't choose a file from a
  real OS dialog - this is the same input handleFileSelect is bound to.
  importPlan reads the file via FileReader, so the resulting state update lands
  asynchronously, outside the fireEvent.change call - act() must stay open until
  it's actually landed, which polling for the success text guarantees. */
  async function chooseFile(planName) {
    const file = new File(
      [
        JSON.stringify({
          bossId: "dancing-green",
          planName,
          partyComp: DEFAULT_PARTY_COMP,
          placements: [pldPlacement("rampart")],
        }),
      ],
      "plan.json",
      { type: "application/json" },
    );
    await act(async () => {
      fireEvent.change(document.querySelector('input[type="file"]'), {
        target: { files: [file] },
      });
      await expect
        .element(page.getByText("Plan imported successfully!"))
        .toBeInTheDocument();
    });
  }

  test("with no draft, clicking Import opens the file picker immediately", async () => {
    render(<App />);

    clickImport();

    expect(openPicker).toHaveBeenCalledTimes(1);
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("with a draft, clicking Import prompts before the file picker opens", async () => {
    await renderOnDraft([pldPlacement("rampart")]);

    clickImport();

    await expect.element(dialogButton("Save")).toBeInTheDocument();
    await expect
      .element(dialogButton("Discard and Continue"))
      .toBeInTheDocument();
    await expect.element(dialogButton("Cancel")).toBeInTheDocument();
    /* The whole point of prompting on the button rather than after a file is
    chosen: the user resolves the draft before picking anything, so the decision
    isn't buried inside what looks like a dialog about their file. */
    expect(openPicker).not.toHaveBeenCalled();
  });

  test("Cancel closes the dialog, keeps the draft, and never opens the picker", async () => {
    const draftId = await renderOnDraft([pldPlacement("rampart")]);
    clickImport();

    fireEvent.click(dialogButton("Cancel").element());

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(getDraft().planId).toBe(draftId);
    expect(openPicker).not.toHaveBeenCalled();
  });

  test("Discard and Continue removes the draft, then opens the picker", async () => {
    await renderOnDraft([pldPlacement("rampart")]);
    clickImport();

    fireEvent.click(dialogButton("Discard and Continue").element());

    expect(getDraft()).toBe(null);
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  /* If the picker is dismissed without choosing a file, handleFileSelect never
  runs - so the reset to New Plan has to happen as part of discarding itself,
  not as a side effect of a completed import. */
  test("Discard and Continue resets to New Plan immediately, even before a file is chosen", async () => {
    await renderOnDraft([pldPlacement("rampart")]);
    clickImport();

    fireEvent.click(dialogButton("Discard and Continue").element());

    await expect.poll(() => getPlanSelect().value).toBe("");
    await expect.element(page.getByAltText("Rampart")).not.toBeInTheDocument();
  });

  test("Save on a sourced draft commits it, then opens the picker", async () => {
    const fooId = seedPlan("Foo");
    const draftPlacements = [pldPlacement("rampart")];
    await renderOnDraft(draftPlacements, {
      planName: "Foo",
      sourcePlanId: fooId,
    });
    clickImport();

    fireEvent.click(dialogButton("Save").element());

    expect(loadPlan(fooId)).toMatchObject({
      planName: "Foo",
      placements: draftPlacements,
    });
    expect(getDraft()).toBe(null);
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  test("Save on a from-scratch draft opens the picker only after the Save As name is given", async () => {
    await renderOnDraft([pldPlacement("rampart")]);
    clickImport();

    fireEvent.click(dialogButton("Save").element());

    await expect.element(page.getByText("Save Plan As")).toBeInTheDocument();
    // A picker opening over the still-unanswered name prompt is the failure mode.
    expect(openPicker).not.toHaveBeenCalled();

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Named Plan" } });
    fireEvent.click(dialogButton("Save").element());

    expect(getDraft()).toBe(null);
    expect(findPlanIdByName("Named Plan")).not.toBe(null);
    expect(openPicker).toHaveBeenCalledTimes(1);
  });

  test("choosing a file after the draft is resolved imports it without prompting a second time", async () => {
    await renderOnDraft([pldPlacement("rampart")]);
    clickImport();
    fireEvent.click(dialogButton("Discard and Continue").element());

    await chooseFile("Imported Plan");

    /* handleFileSelect ends in onPlanChange, an ordinary plan switch - but the
    draft was resolved before the picker opened, so it takes the no-draft path. */
    await expect
      .element(dialogButton("Discard and Continue"))
      .not.toBeInTheDocument();
    await expect
      .poll(() => getPlanSelect().value)
      .toBe(findPlanIdByName("Imported Plan"));
  });
});
