import { act } from "react";
import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import GlobalDialog from "../../src/components/dialog/GlobalDialog.jsx";
import { openDialog, closeDialog } from "../../src/utils/dialogStore.js";

afterEach(() => {
  cleanup();
  closeDialog();
});

describe("GlobalDialog", () => {
  test("renders nothing when the store is closed", async () => {
    render(<GlobalDialog />);

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("renders the dialog with the store's content after openDialog", async () => {
    openDialog({ header: "Test header", body: "Test body" });
    render(<GlobalDialog />);

    await expect.element(page.getByText("Test header")).toBeInTheDocument();
    await expect.element(page.getByText("Test body")).toBeInTheDocument();
  });

  test("renders the store's buttons and their clicks reach the store's onClick", async () => {
    const onConfirm = vi.fn();
    openDialog({
      body: "Test body",
      buttons: [{ label: "Confirm", onClick: onConfirm }],
    });
    render(<GlobalDialog />);

    fireEvent.click(page.getByText("Confirm").element());

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test("the default Close button renders and closes via the store", async () => {
    openDialog({ body: "Test body" });
    render(<GlobalDialog />);

    await expect.element(page.getByText("Close")).toBeInTheDocument();

    fireEvent.click(page.getByText("Close").element());

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("closing also forwards from backdrop/Escape to the store's closeDialog", async () => {
    openDialog({ body: "Test body" });
    render(<GlobalDialog />);

    const backdrop = page.getByRole("dialog").element().parentElement;
    fireEvent.click(backdrop);

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("re-rendering after openDialog is called again reflects the new content", async () => {
    openDialog({ body: "First" });
    render(<GlobalDialog />);

    await expect.element(page.getByText("First")).toBeInTheDocument();

    act(() => {
      openDialog({ body: "Second" });
    });

    await expect.element(page.getByText("Second")).toBeInTheDocument();
    await expect.element(page.getByText("First")).not.toBeInTheDocument();
  });
});
