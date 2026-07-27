import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import PlanManager from "../../src/components/PlanManager.jsx";
import GlobalDialog from "../../src/components/dialog/GlobalDialog.jsx";
import { loadPlan } from "../../src/utils/planStorage";
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
