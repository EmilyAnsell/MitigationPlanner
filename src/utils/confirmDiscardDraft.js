import { closeDialog, openDialog } from "./dialogStore";

/**
 * Opens the "you have unsaved work" dialog shared by every guarded switch
 * (plan selection, import, and eventually boss selection). Callers supply
 * what "save" and "discard" mean for their own flow.
 * @param {Function} onSave - Called if the user chooses to save first.
 * @param {Function} onDiscard - Called if the user chooses to discard the draft.
 * @param {string} body - The message to display in the dialog. Default: "Switching away will delete your draft."
 */
export function confirmDiscardDraft(
  onSave,
  onDiscard,
  body = "Switching away will delete your draft.",
) {
  return openDialog({
    header: "Save Draft?",
    body,
    buttons: [
      { label: "Cancel", onClick: closeDialog, variant: "secondary" },
      { label: "Discard and Continue", onClick: onDiscard, variant: "danger" },
      { label: "Save and Continue", onClick: onSave, variant: "primary" },
    ],
  });
}
