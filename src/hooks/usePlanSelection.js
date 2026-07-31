import { useState } from "react";
import { BOSS_TIMELINES } from "../data/bossTimelines";
import {
  loadPlan,
  getDraft,
  deleteDraft,
  saveDraft,
  savePlan,
} from "../utils/planStorage";

/**
 * Owns which boss timeline and plan are currently selected, the handlers that
 * change them, and the edit-triggered autosave. Switching boss resets the plan;
 * switching plan can retarget the boss.
 * @param {Object} partyComp - The 8-slot party composition (used as a loadPlan fallback).
 * @param {Function} setPartyComp - Setter for partyComp.
 * @param {Function} setPlacements - Setter for placements.
 * @returns {Object} - `currentTimeline`, `currentPlanId`, the derived `timeline`, `handleTimelineChange`/`handlePlanChange`, and `handleAutosave`.
 */
export function usePlanSelection({ partyComp, setPartyComp, setPlacements }) {
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
    // New Plan
    if (!currentPlanId) {
      const draftId = saveDraft({
        bossId: currentTimeline,
        planName: "New Plan",
        partyComp,
        placements,
        sourcePlanId: null,
      });
      setCurrentPlanId(draftId);
      return;
    }
    const planData = loadPlan(currentPlanId);
    // Saving over draft
    if (planData?.isDraft) {
      savePlan(currentPlanId, {
        ...planData,
        partyComp,
        placements,
      });
    }
    // Forking to draft from saved plan
    else {
      const draftId = saveDraft({
        bossId: planData.bossId,
        planName: planData.planName,
        partyComp,
        placements,
        sourcePlanId: currentPlanId,
      });
      setCurrentPlanId(draftId);
    }
  };

  const handleTimelineChange = (newTimeline) => {
    setCurrentTimeline(newTimeline);
    setCurrentPlanId(null);
    setPlacements([]);
  };

  const handlePlanChange = (planId) => {
    const draft = getDraft();
    if (draft && planId !== draft.planId) {
      deleteDraft();
    }

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

  return {
    currentTimeline,
    currentPlanId,
    timeline,
    handleTimelineChange,
    handlePlanChange,
    handleAutosave,
  };
}
