import { act } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import App from "../../src/App.jsx";
import { getJobAbilities } from "../../src/data/jobs";
import { DEFAULT_BOSS_ID } from "../../src/data/bossTimelines";
import {
  saveDraft,
  savePlan,
  generatePlanId,
  getDraft,
  getAllPlans,
  getPlansByBoss,
  loadPlan,
  updateLastViewed,
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

function getPlanSelect() {
  return page.getByRole("combobox", { name: "Plan" }).element();
}

// Loads a plan/draft via PlanManager's plan selector - the app's only seam for
// putting placements into state without a UI drag. Must be called with a
// planId that already exists in storage before render (see seedDraft
// above) - PlanManager only re-reads localStorage on its own render.
function selectPlan(planId) {
  fireEvent.change(getPlanSelect(), { target: { value: planId } });
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

  test("a draft created before mount is selected on remount, with its placements on screen", async () => {
    const rampart = getJobAbilities("PLD").find((a) => a.id === "rampart");
    const draftId = seedDraft([
      { ...rampart, slot: "tank1", startTime: 0, placementId: "seed-1" },
    ]);

    const { unmount } = render(<App />);
    await expect.poll(() => getPlanSelect().value).toBe(draftId);
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
    unmount();

    render(<App />);

    await expect.poll(() => getPlanSelect().value).toBe(draftId);
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
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

// handleAutosave forks a draft on a genuine edit instead of overwriting
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

  test("editing from `New Plan` forks a `New Plan (draft)` with no source", async () => {
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

/* What the Save button itself does. Driven through <App /> because the
branching lives in usePlanSelection.handleSave - PlanManager only forwards the
click. These cases were previously in PlanManager.test.jsx, but once handleSave
moved out, the only way to keep them there was to stand up a stub of it, which
could assert nothing but the stub. The plan-switch confirmation dialog tests
below reach handleSave too, but only via the confirm dialog's Save - never via
the button itself. */
describe("the Save button", () => {
  afterEach(() => {
    cleanup();
    closeDialog();
    localStorage.clear();
  });

  function clickSave() {
    fireEvent.click(page.getByTitle("Save", { exact: true }).element());
  }

  test("on a plain saved plan, re-saves in place and does not prompt for a name", async () => {
    const placements = [pldPlacement("rampart")];
    const fooId = seedPlan("Foo", placements);

    render(<App />);
    selectPlan(fooId);
    await expect.poll(() => getPlanSelect().value).toBe(fooId);

    clickSave();

    await expect.element(page.getByText("Plan saved!")).toBeInTheDocument();
    await expect
      .element(page.getByText("Save Plan As"))
      .not.toBeInTheDocument();
    expect(loadPlan(fooId)).toMatchObject({
      bossId: "dancing-green",
      planName: "Foo",
      placements,
    });
    /* No edit was made, so the on-screen state already matches storage - Save is
    an effective no-op re-save onto the same key (locked design decision #8), not
    a commit, and it must not spawn a second plan or a draft. */
    expect(getPlansByBoss("dancing-green")).toHaveLength(1);
    expect(getDraft()).toBe(null);
    // Saving is not also a navigation - Foo stays loaded and on screen rather
    // than dropping back to "New Plan".
    await expect.poll(() => getPlanSelect().value).toBe(fooId);
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
  });

  test("on a sourced draft, commits onto the source plan and selects it, leaving no draft", async () => {
    const fooId = seedPlan("Foo");
    const draftPlacements = [pldPlacement("rampart")];
    await renderOnDraft(draftPlacements, {
      planName: "Foo",
      sourcePlanId: fooId,
    });

    clickSave();

    await expect.poll(() => getPlanSelect().value).toBe(fooId);
    expect(getDraft()).toBe(null);
    expect(loadPlan(fooId)).toMatchObject({
      planName: "Foo",
      placements: draftPlacements,
      isDraft: false,
    });
    await expect.element(page.getByText("Foo (draft)")).not.toBeInTheDocument();
  });

  test("on a from-scratch draft, routes through Save As and saves the draft's content under the new name", async () => {
    await renderOnDraft([pldPlacement("rampart")]);

    clickSave();

    await expect.element(page.getByText("Save Plan As")).toBeInTheDocument();
    // Nothing is committed while the name is still outstanding.
    expect(getDraft()).not.toBe(null);

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Named Plan" } });
    fireEvent.click(dialogButton("Save").element());

    expect(getDraft()).toBe(null);
    const newPlanId = findPlanIdByName("Named Plan");
    expect(loadPlan(newPlanId)).toMatchObject({
      placements: [pldPlacement("rampart")],
    });
    await expect.poll(() => getPlanSelect().value).toBe(newPlanId);
  });

  /* Storage is outside React and nothing subscribes to it, so the selected
  plan can be removed from under the selection - by a second tab, or by the
  user clearing site data. No in-app path strands the selection this way today;
  deleting the key directly is how the test reaches the state, and this pins
  the handling so a future path that does can't reintroduce the crash.
  Falling through to Save As keeps the on-screen work recoverable - writing
  into the missing key would mint a plan with no bossId, which no boss's plan
  list would ever show again. */
  test("on a selection whose plan no longer exists, routes through Save As rather than saving into the missing key", async () => {
    const fooId = seedPlan("Foo");

    render(<App />);
    selectPlan(fooId);
    await expect.poll(() => getPlanSelect().value).toBe(fooId);

    localStorage.removeItem(`ffxiv-mit-plan-${fooId}`);
    clickSave();

    await expect.element(page.getByText("Save Plan As")).toBeInTheDocument();
    expect(loadPlan(fooId)).toBe(null);

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Recovered" } });
    fireEvent.click(dialogButton("Save").element());

    const recoveredId = findPlanIdByName("Recovered");
    expect(loadPlan(recoveredId)).toMatchObject({ bossId: "dancing-green" });
    await expect.poll(() => getPlanSelect().value).toBe(recoveredId);
  });
});

/* Leaving a plan while a draft exists is confirmed rather than silent.
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

  // Vacuous as of the 2026-08-26 startup-restore feature: "Other Plan" is the
  // only plan in storage and is already selected by the time this runs, so
  // selectPlan below is a no-op. Retained so a regression that stops
  // restoring at mount would still be caught here.
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

  test("switching to New Plan while a draft exists prompts the same way", async () => {
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

/* Import abandons the draft exactly like any other plan switch, so it raises
the same dialog - but on the button, *before* the OS file picker opens, since
the app gets no event when a picker is dismissed. The picker is opened by
fileInputRef.current.click(), so a spy on HTMLInputElement.prototype is both
the only way to observe when it opens and the only way to keep a real native
dialog from opening mid-test. */
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

  test("Save on a sourced draft leaves the committed source selected, not the deleted draft", async () => {
    const fooId = seedPlan("Foo");
    await renderOnDraft([pldPlacement("rampart")], {
      planName: "Foo",
      sourcePlanId: fooId,
    });
    clickImport();

    fireEvent.click(dialogButton("Save").element());

    await expect.poll(() => getPlanSelect().value).toBe(fooId);
  });

  test("Save on a from-scratch draft leaves the newly-named plan selected", async () => {
    await renderOnDraft([pldPlacement("rampart")]);
    clickImport();

    fireEvent.click(dialogButton("Save").element());
    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Named Plan" } });
    fireEvent.click(dialogButton("Save").element());

    await expect
      .poll(() => getPlanSelect().value)
      .toBe(findPlanIdByName("Named Plan"));
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

/* Leaving a draft by switching boss is confirmed the same way as switching
plans - handleTimelineChange reuses confirmDiscardDraft, so this shares the
exact three buttons and Save/Save-As branching. Boss switching always clears
placements and currentPlanId (a boss's placements don't carry over to another
boss), so "switched" here means the boss select's value changed and the
screen is back to an empty New Plan. */
describe("boss-switch confirmation dialog", () => {
  afterEach(() => {
    cleanup();
    closeDialog();
    localStorage.clear();
  });

  // The colon is part of the accessible name: it comes from the visible
  // <label>, which accessible-name computation takes verbatim.
  function getBossSelect() {
    return page.getByRole("combobox", { name: "Boss:" }).element();
  }

  function selectBoss(bossId) {
    fireEvent.change(getBossSelect(), { target: { value: bossId } });
  }

  test("with no draft, changing boss switches immediately without prompting", async () => {
    render(<App />);

    selectBoss("ultimate-boss");

    await expect.poll(() => getBossSelect().value).toBe("ultimate-boss");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("changing boss while a draft exists prompts and switches nothing yet", async () => {
    await renderOnDraft([pldPlacement("rampart")]);

    selectBoss("ultimate-boss");

    await expect.element(dialogButton("Save")).toBeInTheDocument();
    await expect
      .element(dialogButton("Discard and Continue"))
      .toBeInTheDocument();
    await expect.element(dialogButton("Cancel")).toBeInTheDocument();
    expect(getBossSelect().value).toBe("dancing-green");
    // Still the draft's content on screen - the switch is deferred until answered.
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
  });

  test("Cancel leaves the draft intact and the boss where it was", async () => {
    const draftId = await renderOnDraft([pldPlacement("rampart")]);
    selectBoss("ultimate-boss");

    fireEvent.click(dialogButton("Cancel").element());

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(getDraft().planId).toBe(draftId);
    expect(getBossSelect().value).toBe("dancing-green");
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
  });

  test("Discard and Continue removes the draft and switches the boss", async () => {
    await renderOnDraft([pldPlacement("rampart")]);
    selectBoss("ultimate-boss");

    fireEvent.click(dialogButton("Discard and Continue").element());

    await expect.poll(() => getBossSelect().value).toBe("ultimate-boss");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(getDraft()).toBe(null);
    await expect.element(page.getByAltText("Rampart")).not.toBeInTheDocument();
    await expect.poll(() => getPlanSelect().value).toBe("");
  });

  test("Save on a sourced draft commits it onto its source plan, then switches the boss", async () => {
    const fooId = seedPlan("Foo");
    const draftPlacements = [pldPlacement("rampart")];
    await renderOnDraft(draftPlacements, {
      planName: "Foo",
      sourcePlanId: fooId,
    });

    selectBoss("ultimate-boss");
    fireEvent.click(dialogButton("Save").element());

    await expect.poll(() => getBossSelect().value).toBe("ultimate-boss");
    expect(getDraft()).toBe(null);
    expect(loadPlan(fooId)).toMatchObject({
      planName: "Foo",
      placements: draftPlacements,
    });
    /* The switch, not a plan load, is what completes the boss change - the
    committed plan stays saved under its own boss (dancing-green), and the
    screen resets to New Plan rather than reselecting Foo. */
    await expect.poll(() => getPlanSelect().value).toBe("");
    await expect.element(page.getByAltText("Rampart")).not.toBeInTheDocument();
  });

  test("Save on a from-scratch draft routes through Save As, and the boss switches only once a name is given", async () => {
    await renderOnDraft([pldPlacement("rampart")]);

    selectBoss("ultimate-boss");
    fireEvent.click(dialogButton("Save").element());

    await expect.element(page.getByText("Save Plan As")).toBeInTheDocument();
    // Nothing is switched and nothing is committed while the name is outstanding.
    expect(getBossSelect().value).toBe("dancing-green");
    expect(getDraft()).not.toBe(null);

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Named Plan" } });
    fireEvent.click(dialogButton("Save").element());

    await expect.poll(() => getBossSelect().value).toBe("ultimate-boss");
    expect(getDraft()).toBe(null);
    // Saved under the boss it was drafted for, not the boss just switched to.
    expect(loadPlan(findPlanIdByName("Named Plan"))).toMatchObject({
      bossId: "dancing-green",
      placements: [pldPlacement("rampart")],
    });
    await expect.poll(() => getPlanSelect().value).toBe("");
  });
});

/* Covers usePlanSelection's mount-time restore: draft first, else the
last-viewed plan (validated against storage/BOSS_TIMELINES), else blank on
DEFAULT_BOSS_ID. A last-viewed pointer with a null planId is never trusted for
its boss - only a non-null planId's own bossId is - so a boss that's since
been removed from BOSS_TIMELINES can't resurface through a blank New Plan.
Each test drives a real unmount/remount cycle rather than seeding the
last-viewed pointer directly, so the write-through (on the first render) and
the restore (on the second) are both exercised together - except where the
state under test has no path through the UI at all, where storage is edited
directly, same as the deleted-plan-key case above at :411. */
describe("startup restore", () => {
  afterEach(() => {
    cleanup();
    closeDialog();
    localStorage.clear();
  });

  function getBossSelect() {
    return page.getByRole("combobox", { name: "Boss:" }).element();
  }

  function selectBoss(bossId) {
    fireEvent.change(getBossSelect(), { target: { value: bossId } });
  }

  // Ported from MitigationPlanner.test.jsx - PartyComposition's job <select> has
  // no htmlFor/id linking it to its <label>, and the slot label text is
  // duplicated by PartyList's frozen timeline column, so only filtering to the
  // copy sitting in a <div> with a <select> resolves the real control.
  function getSlotSelect(slotLabel) {
    const label = page
      .getByText(slotLabel)
      .elements()
      .find((el) => el.closest("div")?.querySelector("select"));
    return label.closest("div").querySelector("select");
  }

  test("viewing a saved plan without editing it, then remounting, restores that plan with its placements, party comp, and boss", async () => {
    const rampart = getJobAbilities("WAR").find((a) => a.id === "rampart");
    const planId = generatePlanId("ultimate-boss", "Foo");
    savePlan(planId, {
      bossId: "ultimate-boss",
      planName: "Foo",
      partyComp: { ...DEFAULT_PARTY_COMP, tank1: "WAR" },
      placements: [
        { ...rampart, slot: "tank1", startTime: 0, placementId: "seed-1" },
      ],
    });

    const { unmount } = render(<App />);
    selectPlan(planId);
    await expect.poll(() => getPlanSelect().value).toBe(planId);
    unmount();

    render(<App />);

    await expect.poll(() => getPlanSelect().value).toBe(planId);
    await expect.poll(() => getBossSelect().value).toBe("ultimate-boss");
    await expect.poll(() => getSlotSelect("Tank 1").value).toBe("WAR");
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
  });

  // In theory a draft will always be the last-viewed plan, but this ensures the behaviour is kept even with cross-tab potential issues.
  test("a draft is preferred even when the last-viewed pointer names a different plan", async () => {
    const fooId = seedPlan("Foo");

    const { unmount } = render(<App />);
    selectPlan(fooId);
    await expect.poll(() => getPlanSelect().value).toBe(fooId);
    unmount();

    // Seeded directly, as if left behind by another tab - the last-viewed
    // pointer still names "Foo", but a draft's existence is the invariant
    // that wins.
    const draftId = seedDraft([pldPlacement("rampart")]);

    render(<App />);

    await expect.poll(() => getPlanSelect().value).toBe(draftId);
  });

  test("with empty storage, boots to New Plan on the first boss in BOSS_TIMELINES", async () => {
    render(<App />);

    expect(getPlanSelect().value).toBe("");
    expect(getBossSelect().value).toBe(DEFAULT_BOSS_ID);
  });

  test("a last-viewed pointer naming a since-deleted plan boots to the blank default without crashing", async () => {
    const fooId = seedPlan("Foo");
    const { unmount } = render(<App />);
    selectPlan(fooId);
    await expect.poll(() => getPlanSelect().value).toBe(fooId);
    unmount();

    localStorage.removeItem(`ffxiv-mit-plan-${fooId}`);

    expect(() => render(<App />)).not.toThrow();
    expect(getPlanSelect().value).toBe("");
    expect(getBossSelect().value).toBe(DEFAULT_BOSS_ID);
  });

  test("a last-viewed pointer with a null planId falls back to the default boss, not the boss it was recorded with", async () => {
    const { unmount } = render(<App />);
    selectBoss("ultimate-boss");
    await expect.poll(() => getBossSelect().value).toBe("ultimate-boss");
    unmount();

    render(<App />);

    expect(getPlanSelect().value).toBe("");
    await expect.poll(() => getBossSelect().value).toBe(DEFAULT_BOSS_ID);
  });

  test("a last-viewed pointer naming a boss no longer in BOSS_TIMELINES is ignored entirely, not crashed on", async () => {
    const fooId = seedPlan("Foo");
    /* Can't be produced through the UI - the last-viewed pointer's bossId
    never drifts from its plan's own bossId in normal operation - so this is
    written directly to simulate a boss that existed in a previous session but
    has since been removed from bossTimelines.js. The whole record is
    discarded, not just the boss: "Foo" itself is still loadable, but staying
    on it while defaulting only the boss would show a plan alongside a boss it
    was never on. */
    updateLastViewed({ planId: fooId, bossId: "no-longer-exists" });

    expect(() => render(<App />)).not.toThrow();
    expect(getPlanSelect().value).toBe("");
    expect(getBossSelect().value).toBe(DEFAULT_BOSS_ID);
  });
});
