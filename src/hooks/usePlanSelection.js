import { useState } from "react";
import { BOSS_TIMELINES } from "../data/bossTimelines";
import {
  loadPlan,
  getDraft,
  deleteDraft,
  saveDraft,
  savePlan,
  commitDraft,
} from "../utils/planStorage";
import { closeDialog, openDialog } from "../utils/dialogStore";
import { confirmDiscardDraft } from "../utils/confirmDiscardDraft";
import { openSaveAsDialog } from "../utils/openSaveAsDialog";

/**
 * Owns which boss timeline and plan are currently selected, the handlers that
 * change them, and the edit-triggered autosave. Switching boss resets the plan;
 * switching plan can retarget the boss. Switching away from an unsaved draft
 * is guarded by a confirm dialog (see confirmDiscardDraft).
 * @param {Object} partyComp - The 8-slot party composition (used as a loadPlan fallback).
 * @param {Function} setPartyComp - Setter for partyComp.
 * @param {Array} placements - The current placements (used when saving).
 * @param {Function} setPlacements - Setter for placements.
 * @returns {Object} - `currentTimeline`, `currentPlanId`, the derived `timeline`, `handleTimelineChange`/`handlePlanChange`/`handleSave`, and `handleAutosave`.
 */
export function usePlanSelection({
  partyComp,
  setPartyComp,
  placements,
  setPlacements,
}) {
  // Uses a default "dancing-green" boss for now. In the future, this could perhaps be a LATEST_BOSS.
  const [currentTimeline, setCurrentTimeline] = useState("dancing-green");
  const [currentPlanId, setCurrentPlanId] = useState(null);

  const timeline = BOSS_TIMELINES[currentTimeline];

  /**
   * Persists an edit to the currently-selected plan. Called only from App's
   * edit-wrapped setters, never from a load path, so loading a plan never
   * autosaves. Given the next partyComp/placements because this hook does not
   * own that state.
   * @param {Object} partyComp - The next 8-slot party composition.
   * @param {Array} placements - The next placements array.
   */
  const handleAutosave = ({ partyComp, placements }) => {
    const currentPlan = currentPlanId ? loadPlan(currentPlanId) : null;

    // Editing the draft in place — overwrite the same key so its id stays stable.
    if (currentPlan?.isDraft) {
      savePlan(currentPlanId, {
        ...currentPlan,
        partyComp,
        placements,
      });
    } else {
      // If not editing a draft, fork a fresh draft — from the saved plan, or from scratch.
      const draftId = saveDraft({
        bossId: currentPlan?.bossId ?? currentTimeline,
        planName: currentPlan?.planName ?? "New Plan",
        partyComp,
        placements,
        sourcePlanId: currentPlanId ?? null,
      });
      setCurrentPlanId(draftId);
    }
  };

  const applyTimelineChange = (newTimeline) => {
    setCurrentTimeline(newTimeline);
    setCurrentPlanId(null);
    setPlacements([]);
  };

  const handleTimelineChange = (newTimeline) => {
    const draft = getDraft();
    // Unlike handlePlanChange, the plan will always be changed on timeline switch
    if (draft) {
      const onSave = () => handleSave(() => applyTimelineChange(newTimeline));
      const onDiscard = () => {
        deleteDraft();
        closeDialog();
        applyTimelineChange(newTimeline);
      };
      confirmDiscardDraft(onSave, onDiscard);
      return;
    }
    applyTimelineChange(newTimeline);
  };

  /**
   * The unguarded plan switch — loads `planId` (or clears to "New Plan" when
   * null) without asking about any existing draft. Only call this once a
   * draft, if any, has already been resolved (see handlePlanChange).
   * @param {string|null} planId - The plan to switch to, or null for "New Plan".
   */
  const applyPlanChange = (planId) => {
    if (!planId) {
      setCurrentPlanId(null);
      setPlacements([]);
      return;
    }

    const plan = loadPlan(planId);
    if (plan) {
      setCurrentPlanId(planId);
      setPartyComp(plan.partyComp || partyComp);
      setPlacements(plan.placements || []);

      if (plan.bossId !== currentTimeline) {
        setCurrentTimeline(plan.bossId);
      }
    }
  };

  /**
   * Persists the current plan/draft. On a from-scratch draft (or no plan
   * selected at all) this opens the Save As name prompt instead of saving
   * immediately.
   * @param {Function} [afterSave] - Called once the save has landed, with the
   *   id handleSave would naturally switch to next (a committed draft's
   *   source, the plan just overwritten, or the newly-named plan). Callers
   *   with their own destination (a guarded switch, import) can ignore the
   *   argument and navigate there themselves instead.
   */
  const handleSave = (afterSave = (id) => applyPlanChange(id)) => {
    const currentPlan = currentPlanId ? loadPlan(currentPlanId) : null;
    const currentSourceId = currentPlan?.sourcePlanId;

    if (!currentPlanId || (currentPlan?.isDraft && !currentSourceId)) {
      openSaveAsDialog({
        currentTimeline,
        partyComp,
        placements,
        onSaved: afterSave,
      });
      return;
    }

    if (currentPlan.isDraft) {
      commitDraft(currentPlan);
    } else {
      savePlan(currentPlanId, {
        ...currentPlan,
        partyComp,
        placements,
      });
    }

    openDialog({ body: "Plan saved!" });
    afterSave(currentPlan.isDraft ? currentSourceId : currentPlanId);
  };

  /**
   * Guarded plan switch: prompts to save/discard first when a draft exists
   * and the target isn't the draft itself.
   * @param {string|null} planId - The plan to switch to, or null for "New Plan".
   */
  const handlePlanChange = (planId) => {
    const draft = getDraft();
    if (draft && planId !== draft.planId) {
      const onSave = () => handleSave(() => applyPlanChange(planId));
      const onDiscard = () => {
        deleteDraft();
        closeDialog();
        applyPlanChange(planId);
      };
      confirmDiscardDraft(onSave, onDiscard);
      return;
    }
    applyPlanChange(planId);
  };

  return {
    currentTimeline,
    currentPlanId,
    timeline,
    handleTimelineChange,
    handlePlanChange,
    handleAutosave,
    handleSave,
  };
}
