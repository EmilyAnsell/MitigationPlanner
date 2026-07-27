let dialogStore;

beforeEach(async () => {
  vi.resetModules();
  dialogStore = await import("../../src/utils/dialogStore.js");
});

describe("openDialog", () => {
  test("sets isOpen to true and stores header/body/footer exactly as passed", () => {
    const { openDialog, getDialogSnapshot } = dialogStore;
    openDialog({ header: "Header", body: "Body", footer: "Footer" });

    expect(getDialogSnapshot()).toEqual({
      isOpen: true,
      header: "Header",
      body: "Body",
      footer: "Footer",
      buttons: undefined,
    });
  });

  test("omitted header/body/footer come through as undefined on the snapshot", () => {
    const { openDialog, getDialogSnapshot } = dialogStore;
    openDialog({});

    const snapshot = getDialogSnapshot();
    expect(snapshot.header).toBe(undefined);
    expect(snapshot.body).toBe(undefined);
    expect(snapshot.footer).toBe(undefined);
  });

  test("omitted buttons comes through as undefined on the snapshot", () => {
    const { openDialog, getDialogSnapshot } = dialogStore;
    openDialog({ body: "Body" });

    expect(getDialogSnapshot().buttons).toBe(undefined);
  });

  test("uses the provided buttons array as-is when given", () => {
    const { openDialog, getDialogSnapshot } = dialogStore;
    const buttons = [{ label: "Confirm", onClick: () => {} }];
    openDialog({ buttons });

    expect(getDialogSnapshot().buttons).toBe(buttons);
  });

  test("notifies subscribed listeners", () => {
    const { openDialog, subscribeToDialog } = dialogStore;
    const spy = vi.fn();
    subscribeToDialog(spy);

    openDialog({ body: "x" });

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("closeDialog", () => {
  test("sets isOpen to false while preserving the previously-set header/body/footer/buttons", () => {
    const { openDialog, closeDialog, getDialogSnapshot } = dialogStore;
    const buttons = [{ label: "Confirm", onClick: () => {} }];
    openDialog({ header: "Header", body: "Body", footer: "Footer", buttons });

    closeDialog();

    expect(getDialogSnapshot()).toEqual({
      isOpen: false,
      header: "Header",
      body: "Body",
      footer: "Footer",
      buttons,
    });
  });

  test("notifies subscribed listeners", () => {
    const { closeDialog, subscribeToDialog } = dialogStore;
    const spy = vi.fn();
    subscribeToDialog(spy);

    closeDialog();

    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("subscribeToDialog", () => {
  test("a subscribed listener is called on the next openDialog/closeDialog", () => {
    const { openDialog, closeDialog, subscribeToDialog } = dialogStore;
    const spy = vi.fn();
    subscribeToDialog(spy);

    openDialog({ body: "x" });
    expect(spy).toHaveBeenCalledTimes(1);

    closeDialog();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  test("the returned unsubscribe function stops further notifications to that listener", () => {
    const { openDialog, subscribeToDialog } = dialogStore;
    const spy = vi.fn();
    const unsubscribe = subscribeToDialog(spy);

    unsubscribe();
    openDialog({ body: "x" });

    expect(spy).not.toHaveBeenCalled();
  });

  test("multiple independently-subscribed listeners are all notified on a single state change", () => {
    const { openDialog, subscribeToDialog } = dialogStore;
    const spyA = vi.fn();
    const spyB = vi.fn();
    subscribeToDialog(spyA);
    subscribeToDialog(spyB);

    openDialog({ body: "x" });

    expect(spyA).toHaveBeenCalledTimes(1);
    expect(spyB).toHaveBeenCalledTimes(1);
  });
});

describe("getDialogSnapshot", () => {
  test("returns the same object reference across repeated calls when no state change occurred in between", () => {
    const { getDialogSnapshot } = dialogStore;

    expect(getDialogSnapshot()).toBe(getDialogSnapshot());
  });

  test("returns a new object reference after openDialog is called", () => {
    const { openDialog, getDialogSnapshot } = dialogStore;
    const before = getDialogSnapshot();

    openDialog({ body: "x" });

    expect(getDialogSnapshot()).not.toBe(before);
  });

  test("returns a new object reference after closeDialog is called", () => {
    const { closeDialog, getDialogSnapshot } = dialogStore;
    const before = getDialogSnapshot();

    closeDialog();

    expect(getDialogSnapshot()).not.toBe(before);
  });
});
