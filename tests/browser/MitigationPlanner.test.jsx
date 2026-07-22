import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import App from "../../src/App.jsx";
import { afterEach } from "vitest";

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
});
