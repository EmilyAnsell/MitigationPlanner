import { useState, useCallback, useEffect } from "react";
import { BOSS_TIMELINES, DEFAULT_BOSS_ID } from "../data/bossTimelines";
import {
  loadPlan,
  getDraft,
  deleteDraft,
  saveDraft,
  savePlan,
  commitDraft,
  getLastViewed,
  updateLastViewed,
} from "../utils/planStorage";
import { closeDialog, openDialog } from "../utils/dialogStore";
import { confirmDiscardDraft } from "../utils/confirmDiscardDraft";
import { openSaveAsDialog } from "../utils/openSaveAsDialog";

const DEFAULT_PARTY_COMP = {
  tank1: "PLD",
  tank2: "WAR",
  healer1: "AST",
  healer2: "SCH",
  dps1: "DRG",
  dps2: "RDM",
  dps3: "BRD",
  dps4: "PCT",
};

/**
 * Resolves which selection to boot into, in priority order: the current
 * draft (a draft must never exist unselected), else the last-viewed plan if
 * it still validates, else blank.
 * @returns {Object} - `{ bossId, planId, partyComp, placements }`.
 */
function getInitialSelection() {
  const draft = getDraft();
  if (draft) {
    return {
      bossId: draft.bossId,
      planId: draft.planId,
      partyComp: draft.partyComp,
      placements: draft.placements,
    };
  }

  const lastViewed = getLastViewed();
  // A last-viewed record is only trusted when its planId is non-null and
  // still loads a plan, and its bossId is a key of BOSS_TIMELINES.
  if (lastViewed?.planId && BOSS_TIMELINES[lastViewed.bossId]) {
    const plan = loadPlan(lastViewed.planId);
    if (plan) {
      return {
        bossId: lastViewed.bossId,
        planId: lastViewed.planId,
        partyComp: plan.partyComp || DEFAULT_PARTY_COMP,
        placements: plan.placements || [],
      };
    }
  }

  return {
    bossId: DEFAULT_BOSS_ID,
    planId: null,
    partyComp: DEFAULT_PARTY_COMP,
    placements: [],
  };
}

/**
 * Owns which boss timeline, party comp, placements, and plan are currently selected, the handlers that
 * change them, and the edit-triggered autosave. Switching boss resets the plan;
 * switching plan can retarget the boss. Switching away from an unsaved draft
 * is guarded by a confirm dialog (see confirmDiscardDraft).
 * @returns {Object} - `currentTimeline`, `currentPlanId`, the derived `timeline`,
 * `handleTimelineChange`/`handlePlanChange`/`handleSave`, `editPartyComp`, `partyComp`,
    `editPlacements`/`removePlacement`, `placements`
 */
export function usePlanSelection() {
  const [initialSelection] = useState(getInitialSelection); // lazy: runs once per mount
  const [currentTimeline, setCurrentTimeline] = useState(
    initialSelection.bossId,
  );
  const [currentPlanId, setCurrentPlanId] = useState(initialSelection.planId);
  const [placements, setPlacements] = useState(initialSelection.placements);
  const [partyComp, setPartyComp] = useState(initialSelection.partyComp);

  // Write-through, not a subscription: one place, so every path that changes the
  // selection is covered. Re-runs (StrictMode, restore-at-mount) rewrite the same value.
  useEffect(() => {
    updateLastViewed({ planId: currentPlanId, bossId: currentTimeline });
  }, [currentPlanId, currentTimeline]);

  const timeline = BOSS_TIMELINES[currentTimeline];

  /**
   * Persists an edit to the currently-selected plan. Takes the next
   * partyComp/placements explicitly rather than reading the hook's own state,
   * since the caller's setPartyComp/setPlacements haven't landed yet when this runs.
   * @param {Object} partyComp - The next 8-slot party composition.
   * @param {Array} placements - The next placements array.
   */
  const handleAutosave = useCallback(
    /* Memoized handleAutosave so editPlacements/editPartyComp below can be stable: editPlacements is a
      dep of useDragPlacement's completePlacement, which a document-level drop effect
      subscribes on. A fresh closure here would re-subscribe that listener every render.
  */
    ({ partyComp, placements }) => {
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
          sourcePlanId: currentPlan ? currentPlanId : null,
        });
        setCurrentPlanId(draftId);
      }
    },
    [currentPlanId, currentTimeline],
  );

  const applyTimelineChange = (newTimeline) => {
    setCurrentTimeline(newTimeline);
    setCurrentPlanId(null);
    setPlacements([]);
  };

  const handleTimelineChange = (newTimeline) => {
    const draft = getDraft();
    // Unlike handlePlanChange, the plan will always be changed on timeline switch
    if (draft) {
      const onSave = () => {
        closeDialog();
        handleSave(() => applyTimelineChange(newTimeline));
      };
      const onDiscard = () => {
        deleteDraft();
        closeDialog();
        applyTimelineChange(newTimeline);
      };
      const body = `Switching to a different boss will delete your draft.`;
      confirmDiscardDraft(onSave, onDiscard, body);
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

    if (!currentPlan || (currentPlan.isDraft && !currentSourceId)) {
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
      const onSave = () => {
        closeDialog();
        handleSave(() => applyPlanChange(planId));
      };
      const onDiscard = () => {
        deleteDraft();
        closeDialog();
        applyPlanChange(planId);
      };
      const body = `Switching to a different plan will delete your draft.`;
      confirmDiscardDraft(onSave, onDiscard, body);
      return;
    }
    applyPlanChange(planId);
  };

  /**
   * Sets the partyComp to the composition given by a changed selector, then autosaves.
   * @param {Object} nextComp
   */
  const editPartyComp = useCallback(
    (nextComp) => {
      setPartyComp(nextComp);
      handleAutosave({ partyComp: nextComp, placements });
    },
    [placements, handleAutosave],
  );

  /**
   * Sets the placements state to the list given by adding/removing/moving an ability on the timeline, then autosaves.
   * @param {Array} nextPlacements
   */
  const editPlacements = useCallback(
    (nextPlacements) => {
      setPlacements(nextPlacements);
      handleAutosave({ partyComp, placements: nextPlacements });
    },
    [partyComp, handleAutosave],
  );

  /**
   * Removes the indicated placement from the placements state.
   * Unlike editPlacements, Timeline (where removePlacement is used) isn't memoized yet, so callback unnecssary here.
   * @param {string} placementId
   */
  const removePlacement = (placementId) => {
    editPlacements(placements.filter((p) => p.placementId !== placementId));
  };

  return {
    currentTimeline,
    currentPlanId,
    timeline,
    handleTimelineChange,
    handlePlanChange,
    handleSave,
    editPartyComp,
    partyComp,
    editPlacements,
    removePlacement,
    placements,
  };
}
