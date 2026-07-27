import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import App from "../../src/App.jsx";
import { getJobAbilities } from "../../src/data/jobs";
import { savePlan, generatePlanId } from "../../src/utils/planStorage";

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

/* Saves a plan directly into localStorage (bypassing drag-and-drop, which "placing an ability"
covers), for `selectPlan` to load post-mount. Must be called *before* `render`: PlanManager only
re-reads localStorage on its own render, so a plan saved after mount has no corresponding <option>
yet - setting the <select>'s value to that (still non-existent) planId is then a no-op, silently
resetting to "" instead of selecting it. */
function seedPlanWithPlacements(placements) {
  const planId = generatePlanId("dancing-green", "Test Plan");
  savePlan(planId, {
    bossId: "dancing-green",
    planName: "Test Plan",
    partyComp: DEFAULT_PARTY_COMP,
    placements,
  });
  return planId;
}

// Loads a plan seeded by `seedPlanWithPlacements` via PlanManager's plan selector - the app's
// only seam for putting placements into state without a UI drag.
function selectPlan(planId) {
  const planSelect = page
    .getByText("New Plan (Unsaved)")
    .element()
    .closest("select");
  fireEvent.change(planSelect, { target: { value: planId } });
}

describe("placing an ability", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear(); // Auto-save writes to localStorage
  });

  test("dragging an ability from the palette onto a timeline row places it in that slot", async () => {
    render(<App />);

    /* This test relies on App's defaults: partyComp.tank1 = "PLD" (Paladin) and selectedSlot =
    "tank1", so the palette renders Paladin's abilities (incl. Holy Sheltron) and the tank1 row
    exists. Those defaults are the test's preconditions — if they change, the getByText and
    getByTestId lookups below throw and point straight here, so no explicit assertions are needed. */
    const paletteAbility = page
      .getByText("Holy Sheltron")
      .element()
      .closest('[draggable="true"]');
    const dropZone = page.getByTestId("dropzone-tank1").element();
    const rect = dropZone.getBoundingClientRect();

    fireEvent.dragStart(paletteAbility);
    fireEvent.dragOver(dropZone, { clientX: rect.left + 40 }); // 40 pixels over, comfortably in drop zone
    fireEvent.drop(dropZone);

    /* Placed abilities carry the ability name as icon alt text; the palette icon has alt="" (empty),
    so getByAltText matches only the placed ability, not the source in the palette. */
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();
  });

  test("dragging an ability from the palette onto a timeline row with a conflicting ability near the end of the timeline does not place it if the cooldown ends before the timeline's max", async () => {
    render(<App />);

    const dropZone = page.getByTestId("dropzone-tank1").element();
    const rect = dropZone.getBoundingClientRect();

    /* Rampart is a role ability with a 90s cooldown; the default timeline (M5S) is 606s long.
    Dropping it at t=590 (590s * 4px/s past the row's left edge) leaves its cooldown running to t=680
    - past the timeline's end, with no cooldown-free moment left afterward. A conflicting drop earlier in the
    timeline would just get nudged to the next free moment; here there is no "next free moment" to nudge to,
    so a second drop at the same spot is rejected outright rather than relocated. */
    const conflictingClientX = rect.left + 590 * 4;

    fireEvent.dragStart(
      page.getByText("Rampart").element().closest('[draggable="true"]'),
    );
    fireEvent.dragOver(dropZone, { clientX: conflictingClientX });
    fireEvent.drop(dropZone);

    fireEvent.dragStart(
      page.getByText("Rampart").element().closest('[draggable="true"]'),
    );
    fireEvent.dragOver(dropZone, { clientX: conflictingClientX });
    fireEvent.drop(dropZone);

    // Only the first drop's placement exists - the conflicting second drop was rejected, not relocated.
    await expect
      .poll(() => page.getByAltText("Rampart").elements().length)
      .toBe(1);
  });
});

describe("clearing a row", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear(); // Auto-save writes to localStorage
  });

  /* PartyComposition's job <select> has no htmlFor/id linking it to its <label>, and its
  slot label text (e.g. "Tank 1") is duplicated by PartyList's frozen timeline column, so
  page.getByText can't uniquely resolve it. Only the PartyComposition copy sits in a <div>
  with a <select>, so filtering on that disambiguates and finds the real control. */
  function getSlotSelect(slotLabel) {
    const label = page
      .getByText(slotLabel)
      .elements()
      .find((el) => el.closest("div")?.querySelector("select"));
    return label.closest("div").querySelector("select");
  }

  test("swapping a slot's job with no existing placements changes the job immediately without opening a confirmation dialog", async () => {
    render(<App />);

    // Default: tank2 = "WAR" (Warrior), with no abilities placed on it.
    const tank2Select = getSlotSelect("Tank 2");
    fireEvent.change(tank2Select, { target: { value: "PLD" } });

    await expect.poll(() => tank2Select.value).toBe("PLD");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("swapping a slot's job with placements opens a confirmation dialog, and confirming clears job-specific abilities but keeps role abilities matching the new job's role", async () => {
    // Holy Sheltron is Paladin-specific; Rampart is a shared Tank role ability - both on tank1.
    const holySheltron = getJobAbilities("PLD").find(
      (a) => a.id === "holy-sheltron",
    );
    const rampart = getJobAbilities("PLD").find((a) => a.id === "rampart");
    const planId = seedPlanWithPlacements([
      { ...holySheltron, slot: "tank1", startTime: 0, placementId: "seed-1" },
      { ...rampart, slot: "tank1", startTime: 30, placementId: "seed-2" },
    ]);

    render(<App />);
    selectPlan(planId);
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();

    // WAR is also role "Tank", same as PLD, so the Rampart placement's role should be preserved.
    const tank1Select = getSlotSelect("Tank 1");
    fireEvent.change(tank1Select, { target: { value: "WAR" } });

    await expect
      .element(page.getByText("Clear non-role abilities from Paladin?"))
      .toBeInTheDocument();
    fireEvent.click(
      page.getByRole("button", { name: "Continue", exact: true }).element(),
    );

    await expect.poll(() => tank1Select.value).toBe("WAR");
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .not.toBeInTheDocument();
    await expect.element(page.getByAltText("Rampart")).toBeInTheDocument();
  });

  test("swapping a slot's job with placements leaves the job and placements unchanged when the user cancels the confirmation dialog", async () => {
    const holySheltron = getJobAbilities("PLD").find(
      (a) => a.id === "holy-sheltron",
    );
    const planId = seedPlanWithPlacements([
      { ...holySheltron, slot: "tank1", startTime: 0, placementId: "seed-1" },
    ]);

    render(<App />);
    selectPlan(planId);
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();

    const tank1Select = getSlotSelect("Tank 1");
    fireEvent.change(tank1Select, { target: { value: "WAR" } });

    await expect
      .element(page.getByText("Clear non-role abilities from Paladin?"))
      .toBeInTheDocument();
    fireEvent.click(
      page.getByRole("button", { name: "Cancel", exact: true }).element(),
    );

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => tank1Select.value).toBe("PLD");
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();
  });

  test("clicking a party slot's clear-row button removes its placements without opening a confirmation dialog", async () => {
    const holySheltron = getJobAbilities("PLD").find(
      (a) => a.id === "holy-sheltron",
    );
    const rampart = getJobAbilities("PLD").find((a) => a.id === "rampart");
    const planId = seedPlanWithPlacements([
      { ...holySheltron, slot: "tank1", startTime: 0, placementId: "seed-1" },
      { ...rampart, slot: "tank1", startTime: 30, placementId: "seed-2" },
    ]);

    render(<App />);
    selectPlan(planId);
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();

    // PartyList's clear-row button - title comes from `Clear ${job.name} row` for the slot's current job.
    fireEvent.click(page.getByTitle("Clear Paladin row").element());

    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .not.toBeInTheDocument();
    await expect.element(page.getByAltText("Rampart")).not.toBeInTheDocument();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });
});

describe("clearing the whole timeline", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear(); // Auto-save writes to localStorage
  });

  test("clicking Clear Timeline opens a confirmation dialog, and confirming removes every placement", async () => {
    const holySheltron = getJobAbilities("PLD").find(
      (a) => a.id === "holy-sheltron",
    );
    const planId = seedPlanWithPlacements([
      { ...holySheltron, slot: "tank1", startTime: 0, placementId: "seed-1" },
    ]);

    render(<App />);
    selectPlan(planId);
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();

    fireEvent.click(page.getByText("Clear Timeline").element());

    await expect
      .element(page.getByText("Clear all abilities from the timeline?"))
      .toBeInTheDocument();
    fireEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Clear All" }).element(),
    );

    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .not.toBeInTheDocument();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("cancelling the Clear Timeline dialog leaves the placements untouched", async () => {
    const holySheltron = getJobAbilities("PLD").find(
      (a) => a.id === "holy-sheltron",
    );
    const planId = seedPlanWithPlacements([
      { ...holySheltron, slot: "tank1", startTime: 0, placementId: "seed-1" },
    ]);

    render(<App />);
    selectPlan(planId);
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();

    fireEvent.click(page.getByText("Clear Timeline").element());
    fireEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Cancel" }).element(),
    );

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect
      .element(page.getByAltText("Holy Sheltron"))
      .toBeInTheDocument();
  });
});
