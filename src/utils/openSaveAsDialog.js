import { createElement } from "react";
import {
  generatePlanId,
  getPlansByBoss,
  savePlan,
  deleteDraft,
} from "./planStorage";
import { closeDialog, openDialog } from "./dialogStore";
import SaveAsBody from "../components/dialog/custom_components/SaveAsBody";

/**
 * Opens the "Save Plan As" name-prompt dialog and, once a name is given,
 * saves a new plan under it, clears any draft, and calls onSaved with the
 * new plan's id. Shared by PlanManager's explicit Save As button and
 * usePlanSelection's handleSave (for from-scratch/no-plan saves).
 *
 * If the name collides with an existing (non-draft) plan for the same boss,
 * the user is asked to overwrite it (reusing its id - a true replace) or go
 * back to this same dialog to choose a different name.
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

  const performSave = (planId, planName, savedMessage) => {
    savePlan(planId, {
      bossId: currentTimeline,
      planName,
      partyComp,
      placements,
    });

    // onSaved is often/sometimes a handlePlanChange. If we don't delete here, it will prompt another "Discard draft?" dialog because the draft is still present.
    deleteDraft();
    openDialog({ body: savedMessage });
    onSaved(planId);
  };

  const submitSaveAs = () => {
    const trimmedName = nameRef.current.trim();
    if (!trimmedName) {
      errorHandleRef.current?.showError();
      return;
    }

    const existingPlan = getPlansByBoss(currentTimeline).find(
      (plan) => !plan.isDraft && plan.planName === trimmedName,
    );

    if (existingPlan) {
      openDialog({
        header: "Overwrite Plan?",
        body: `A plan named "${trimmedName}" already exists for this boss.`,
        buttons: [
          {
            label: "Choose New Name",
            onClick: () =>
              openSaveAsDialog({
                currentTimeline,
                partyComp,
                placements,
                onSaved,
              }),
            variant: "secondary",
          },
          {
            label: "Overwrite",
            onClick: () =>
              performSave(existingPlan.planId, trimmedName, "Plan saved!"),
            variant: "danger",
          },
        ],
      });
      return;
    }

    performSave(
      generatePlanId(currentTimeline, trimmedName),
      trimmedName,
      "Plan saved as new!",
    );
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
