import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import App from "../../src/App.jsx";
import { getJobAbilities } from "../../src/data/jobs";
import {
  saveDraft,
  savePlan,
  generatePlanId,
  getDraft,
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
