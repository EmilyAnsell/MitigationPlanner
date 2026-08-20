import { createElement } from "react";
import { generatePlanId, savePlan, deleteDraft } from "./planStorage";
import { closeDialog, openDialog } from "./dialogStore";
import SaveAsBody from "../components/dialog/custom_components/SaveAsBody";

/**
 * Opens the "Save Plan As" name-prompt dialog and, once a name is given,
 * saves a new plan under it, clears any draft, and calls onSaved with the
 * new plan's id. Shared by PlanManager's explicit Save As button and
 * usePlanSelection's handleSave (for from-scratch/no-plan saves).
 * @param {string} currentTimeline - The boss id to save the plan under.
 * @param {Object} partyComp - The 8-slot party composition to save.
 * @param {Array} placements - The placements to save.
 * @param {Function} onSaved - Called with the new plan's id once saved.
 */
export function openSaveAsDialog({
  currentTimeline,
  partyComp,
  placements,
  onSaved,
}) {
  const nameRef = { current: "" };
  const errorHandleRef = { current: null };

  const submitSaveAs = () => {
    const trimmedName = nameRef.current.trim();
    if (!trimmedName) {
      errorHandleRef.current?.showError();
      return;
    }

    const newPlanId = generatePlanId(currentTimeline, trimmedName);
    savePlan(newPlanId, {
      bossId: currentTimeline,
      planName: trimmedName,
      partyComp,
      placements,
    });

    // onSaved is often/sometimes a handlePlanChange. If we don't delete here, it will prompt another "Discard draft?" dialog because the draft is still present.
    deleteDraft();
    openDialog({ body: "Plan saved as new!" });
    onSaved(newPlanId);
  };

  openDialog({
    header: "Save Plan As",
    body: createElement(SaveAsBody, {
      ref: errorHandleRef,
      onNameChange: (value) => {
        nameRef.current = value;
      },
      onSubmit: submitSaveAs,
    }),
    buttons: [
      { label: "Cancel", onClick: closeDialog, variant: "secondary" },
      { label: "Save", onClick: submitSaveAs },
    ],
  });
}
