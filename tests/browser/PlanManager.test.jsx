import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import PlanManager from "../../src/components/PlanManager.jsx";
import GlobalDialog from "../../src/components/dialog/GlobalDialog.jsx";
import {
  loadPlan,
  savePlan,
  generatePlanId,
} from "../../src/utils/planStorage";
import { closeDialog } from "../../src/utils/dialogStore";

// GlobalDialog is rendered alongside PlanManager because openDialog/closeDialog
// write to a store outside React - PlanManager triggers dialogs, but GlobalDialog
// is what actually renders them, same as in the real App tree.
function renderPlanManager(props = {}) {
  const onPlanChange = vi.fn();
  render(
    <>
      <PlanManager
        currentTimeline="test-boss"
        currentPlanId={null}
        onPlanChange={onPlanChange}
        partyComp={{}}
        placements={[]}
        {...props}
      />
      <GlobalDialog />
    </>,
  );
  return { onPlanChange };
}

describe("PlanManager Save As flow", () => {
  afterEach(() => {
    cleanup();
    closeDialog();
    localStorage.clear();
  });

  test("clicking Save As opens the Save Plan As dialog with an empty input and no reminder", async () => {
    renderPlanManager();

    fireEvent.click(page.getByTitle("Save As").element());

    await expect.element(page.getByText("Save Plan As")).toBeInTheDocument();
    await expect
      .element(page.getByPlaceholder("Enter plan name..."))
      .toBeInTheDocument();
    await expect
      .element(page.getByText("*Please enter a plan name."))
      .not.toBeInTheDocument();
  });

  test("clicking Save with a blank name shows the reminder, keeps the dialog open, and does not save", async () => {
    const { onPlanChange } = renderPlanManager();
    fireEvent.click(page.getByTitle("Save As").element());

    const dialog = page.getByRole("dialog");
    fireEvent.click(dialog.getByRole("button", { name: "Save" }).element());

    await expect
      .element(page.getByText("*Please enter a plan name."))
      .toBeInTheDocument();
    await expect
      .element(page.getByPlaceholder("Enter plan name..."))
      .toBeInTheDocument();
    expect(onPlanChange).not.toHaveBeenCalled();
  });

  test("a whitespace-only name is treated as blank", async () => {
    renderPlanManager();
    fireEvent.click(page.getByTitle("Save As").element());

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Save" }).element(),
    );

    await expect
      .element(page.getByText("*Please enter a plan name."))
      .toBeInTheDocument();
  });

  test("entering a name and clicking Save persists the plan and reports the new plan id", async () => {
    const { onPlanChange } = renderPlanManager();
    fireEvent.click(page.getByTitle("Save As").element());

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "My Plan" } });
    fireEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Save" }).element(),
    );

    expect(onPlanChange).toHaveBeenCalledTimes(1);
    const newPlanId = onPlanChange.mock.calls[0][0];
    expect(newPlanId).toMatch(/^test-boss-my-plan-\d+$/);

    const savedPlan = loadPlan(newPlanId);
    expect(savedPlan.planName).toBe("My Plan");
    expect(savedPlan.bossId).toBe("test-boss");

    await expect
      .element(page.getByText("Plan saved as new!"))
      .toBeInTheDocument();
  });

  test("pressing Enter in the input submits the same as clicking Save", async () => {
    const { onPlanChange } = renderPlanManager();
    fireEvent.click(page.getByTitle("Save As").element());

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Enter Plan" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(onPlanChange).toHaveBeenCalledTimes(1);
    await expect
      .element(page.getByText("Plan saved as new!"))
      .toBeInTheDocument();
  });

  test("fixing a blank name after a failed attempt and resubmitting succeeds", async () => {
    const { onPlanChange } = renderPlanManager();
    fireEvent.click(page.getByTitle("Save As").element());

    const dialog = page.getByRole("dialog");
    fireEvent.click(dialog.getByRole("button", { name: "Save" }).element());
    await expect
      .element(page.getByText("*Please enter a plan name."))
      .toBeInTheDocument();

    const input = page.getByPlaceholder("Enter plan name...").element();
    fireEvent.change(input, { target: { value: "Retry Plan" } });
    fireEvent.click(dialog.getByRole("button", { name: "Save" }).element());

    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange.mock.calls[0][0]).toMatch(/^test-boss-retry-plan-\d+$/);
  });

  test("clicking Cancel closes the dialog without saving", async () => {
    const { onPlanChange } = renderPlanManager();
    fireEvent.click(page.getByTitle("Save As").element());

    fireEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Cancel" }).element(),
    );

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(onPlanChange).not.toHaveBeenCalled();
  });

  test("clicking Save with no current plan falls back to the Save As dialog", async () => {
    const { onPlanChange } = renderPlanManager({ currentPlanId: null });

    fireEvent.click(page.getByTitle("Save", { exact: true }).element());

    await expect.element(page.getByText("Save Plan As")).toBeInTheDocument();
    expect(onPlanChange).not.toHaveBeenCalled();
  });
});

describe("PlanManager Delete flow", () => {
  afterEach(() => {
    cleanup();
    closeDialog();
    localStorage.clear();
  });

  /* Seeds a saved plan and renders PlanManager already pointed at it. The Delete
  button only renders when currentPlanId is set, and the confirmation body reads
  the plan's name from getPlansByBoss - so the plan must exist in localStorage
  before render (PlanManager reads storage on its own render). */
  function renderWithSavedPlan(planName = "My Plan") {
    const planId = generatePlanId("test-boss", planName);
    savePlan(planId, {
      bossId: "test-boss",
      planName,
      partyComp: {},
      placements: [],
    });
    const { onPlanChange } = renderPlanManager({ currentPlanId: planId });
    return { planId, onPlanChange };
  }

  test("clicking Delete opens a confirmation dialog naming the current plan", async () => {
    renderWithSavedPlan("My Plan");

    fireEvent.click(page.getByTitle("Delete").element());

    await expect
      .element(page.getByText('Delete plan "My Plan"?'))
      .toBeInTheDocument();
  });

  test("confirming Delete removes the plan, clears the selection, and reports it deleted", async () => {
    const { planId, onPlanChange } = renderWithSavedPlan("My Plan");

    fireEvent.click(page.getByTitle("Delete").element());
    fireEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Delete" }).element(),
    );

    expect(loadPlan(planId)).toBe(null);
    expect(onPlanChange).toHaveBeenCalledTimes(1);
    expect(onPlanChange).toHaveBeenCalledWith(null);
    await expect.element(page.getByText("Plan deleted")).toBeInTheDocument();
  });

  test("cancelling Delete leaves the plan intact and does not change the selection", async () => {
    const { planId, onPlanChange } = renderWithSavedPlan("My Plan");

    fireEvent.click(page.getByTitle("Delete").element());
    fireEvent.click(
      page.getByRole("dialog").getByRole("button", { name: "Cancel" }).element(),
    );

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(loadPlan(planId)).not.toBe(null);
    expect(onPlanChange).not.toHaveBeenCalled();
  });
});
