import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import App from "../../src/App.jsx";

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
