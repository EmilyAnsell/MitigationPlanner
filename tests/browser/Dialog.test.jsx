import { render, cleanup, fireEvent } from "@testing-library/react";
import { page } from "vitest/browser";
import Dialog from "../../src/components/dialog/Dialog.jsx";

describe("Dialog mouse interaction", () => {
  afterEach(() => {
    cleanup();
  });

  test("Footer onClick buttons activate and apply their designated effect", async () => {
    const onConfirm = vi.fn();
    const onCloseDialog = vi.fn();
    const buttons = [
      { label: "Cancel", onClick: onCloseDialog },
      { label: "Confirm", onClick: onConfirm },
    ];
    render(
      <Dialog
        isDialogOpen={true}
        onCloseDialog={onCloseDialog}
        buttons={buttons}
      />,
    );

    fireEvent.click(page.getByText("Confirm").element());
    expect(onConfirm).toHaveBeenCalledTimes(1);

    fireEvent.click(page.getByText("Cancel").element());
    expect(onCloseDialog).toHaveBeenCalledTimes(1);
  });

  test("clicking the black backdrop closes the dialog", async () => {
    const onCloseDialog = vi.fn();
    render(<Dialog isDialogOpen={true} onCloseDialog={onCloseDialog} />);

    const backdrop = page.getByRole("dialog").element().parentElement;
    fireEvent.click(backdrop);

    expect(onCloseDialog).toHaveBeenCalledTimes(1);
  });

  test("clicking inside the modal's body, but not a button, has no affect", async () => {
    const onCloseDialog = vi.fn();
    render(<Dialog isDialogOpen={true} onCloseDialog={onCloseDialog} />);

    fireEvent.click(page.getByRole("dialog").element());

    expect(onCloseDialog).not.toHaveBeenCalled();
  });
});

describe("Dialog button variants", () => {
  afterEach(() => {
    cleanup();
  });

  test("a button with variant 'danger' renders the red classes", async () => {
    const buttons = [{ label: "Delete", onClick: vi.fn(), variant: "danger" }];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    expect(page.getByText("Delete").element().className).toContain(
      "bg-red-600",
    );
  });

  test("a button with variant 'secondary' renders the gray classes", async () => {
    const buttons = [
      { label: "Cancel", onClick: vi.fn(), variant: "secondary" },
    ];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    expect(page.getByText("Cancel").element().className).toContain(
      "bg-gray-600",
    );
  });

  test("a button with an omitted variant still renders the default blue classes", async () => {
    const buttons = [{ label: "Confirm", onClick: vi.fn() }];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    expect(page.getByText("Confirm").element().className).toContain(
      "bg-blue-600",
    );
  });

  test("a button with an unrecognized variant renders without error and falls back to the default blue classes", async () => {
    const buttons = [
      { label: "Confirm", onClick: vi.fn(), variant: "bigbutton" },
    ];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    expect(page.getByText("Confirm").element().className).toContain(
      "bg-blue-600",
    );
  });
});

describe("Open/Closed rendering", () => {
  afterEach(() => {
    cleanup();
  });

  test("dialog is not rendered when it is not open", async () => {
    render(<Dialog isDialogOpen={false} onCloseDialog={vi.fn()} />);

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("a Dialog without a passed isDialogOpen does not render", async () => {
    render(<Dialog onCloseDialog={vi.fn()} />);

    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
  });

  test("Escape does nothing when Dialog is not open", () => {
    const onCloseDialog = vi.fn();
    render(<Dialog isDialogOpen={false} onCloseDialog={onCloseDialog} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCloseDialog).not.toHaveBeenCalled();
  });
});

describe("Dialog keyboard interaction", () => {
  afterEach(() => {
    cleanup();
  });

  test("the first footer button receives focus when the dialog opens", async () => {
    const buttons = [
      { label: "Cancel", onClick: vi.fn() },
      { label: "Confirm", onClick: vi.fn() },
    ];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    await expect.element(page.getByText("Cancel")).toHaveFocus();
  });

  test("pressing Escape closes the dialog", async () => {
    const onCloseDialog = vi.fn();
    render(<Dialog isDialogOpen={true} onCloseDialog={onCloseDialog} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onCloseDialog).toHaveBeenCalledTimes(1);
  });

  test("ArrowRight moves focus to the next button, wrapping from the last button back to the first", async () => {
    const buttons = [
      { label: "Cancel", onClick: vi.fn() },
      { label: "Confirm", onClick: vi.fn() },
    ];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    fireEvent.keyDown(document, { key: "ArrowRight" });
    await expect.element(page.getByText("Confirm")).toHaveFocus();

    fireEvent.keyDown(document, { key: "ArrowRight" });
    await expect.element(page.getByText("Cancel")).toHaveFocus();
  });

  test("ArrowLeft moves focus to the previous button, wrapping from the first button back to the last", async () => {
    const buttons = [
      { label: "Cancel", onClick: vi.fn() },
      { label: "Confirm", onClick: vi.fn() },
    ];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    fireEvent.keyDown(document, { key: "ArrowLeft" });
    await expect.element(page.getByText("Confirm")).toHaveFocus();
  });

  test("Tab wraps focus from the last button back to the first, rather than leaving the dialog", async () => {
    const buttons = [
      { label: "Cancel", onClick: vi.fn() },
      { label: "Confirm", onClick: vi.fn() },
    ];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    fireEvent.keyDown(document, { key: "Tab" });
    await expect.element(page.getByText("Confirm")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    await expect.element(page.getByText("Cancel")).toHaveFocus();
  });

  test("Shift+Tab wraps focus from the first button back to the last, rather than leaving the dialog", async () => {
    const buttons = [
      { label: "Cancel", onClick: vi.fn() },
      { label: "Confirm", onClick: vi.fn() },
    ];
    render(
      <Dialog isDialogOpen={true} onCloseDialog={vi.fn()} buttons={buttons} />,
    );

    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    await expect.element(page.getByText("Confirm")).toHaveFocus();
  });

  test("the focus trap covers focusable content in the body, not just the footer buttons", async () => {
    const buttons = [{ label: "OK", onClick: vi.fn() }];
    render(
      <Dialog
        isDialogOpen={true}
        onCloseDialog={vi.fn()}
        bodyContent={<input placeholder="name" />}
        buttons={buttons}
      />,
    );

    // Body content precedes the footer in DOM order, so it gets initial focus.
    await expect.element(page.getByPlaceholder("name")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    await expect.element(page.getByText("OK")).toHaveFocus();

    fireEvent.keyDown(document, { key: "Tab" });
    await expect.element(page.getByPlaceholder("name")).toHaveFocus();
  });
});
