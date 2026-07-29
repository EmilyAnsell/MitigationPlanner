import { openDialog } from "./dialogStore";

const STORAGE_PREFIX = "ffxiv-mit-plan-";

export function getAllPlans() {
  const plans = {};

  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith(STORAGE_PREFIX)) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        const planId = key.replace(STORAGE_PREFIX, "");
        plans[planId] = data;
      } catch (e) {
        console.error("Error loading plan:", key, e);
      }
    }
  }

  return plans;
}

export function getPlansByBoss(bossId) {
  const allPlans = getAllPlans();
  return Object.entries(allPlans)
    .filter(([_, plan]) => plan.bossId === bossId)
    .map(([planId, plan]) => ({ planId, ...plan }));
}

export function savePlan(planId, data) {
  const key = STORAGE_PREFIX + planId;
  localStorage.setItem(
    key,
    JSON.stringify({
      ...data,
      lastModified: new Date().toISOString(),
    }),
  );
}

export function loadPlan(planId) {
  const key = STORAGE_PREFIX + planId;
  const data = localStorage.getItem(key);
  return data ? JSON.parse(data) : null;
}

export function deletePlan(planId) {
  const key = STORAGE_PREFIX + planId;
  localStorage.removeItem(key);
}

/**
 * Lowercases a name and replaces every non-alphanumeric character with a dash.
 * Shared by generatePlanId and the draft id so both sanitize identically.
 * @param {string} name - The name to sanitize.
 * @returns {string} - The sanitized name.
 */
export function sanitizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "-");
}

export function generatePlanId(bossId, planName) {
  return `${bossId}-${sanitizeName(planName)}-${Date.now()}`;
}

/**
 * Returns the current draft, or null if none exists. At most one plan is ever
 * tagged isDraft: true.
 * @returns {Object|null} - The draft, including its planId, or null.
 */
export function getDraft() {
  const entry = Object.entries(getAllPlans()).find(
    ([_, plan]) => plan.isDraft === true,
  );
  return entry ? { planId: entry[0], ...entry[1] } : null;
}

/**
 * Replaces the current draft (if any) with a new one. At most one draft can
 * exist in storage at a time.
 * @param {string} bossId - The boss the draft belongs to.
 * @param {string} planName - The draft's base name (e.g. "Foo" or "New Plan"), without the "(draft)" suffix.
 * @param {Object} partyComp - The 8-slot party composition.
 * @param {Array} placements - Abilities placed on the timeline.
 * @param {string|null} sourcePlanId - The plan this draft was forked from, or null if started from scratch.
 * @returns {string} - The new draft's id.
 */
export function saveDraft({
  bossId,
  planName,
  partyComp,
  placements,
  sourcePlanId,
}) {
  deleteDraft();
  const draftId = `${bossId}-${sanitizeName(planName)}-draft`;
  savePlan(draftId, {
    bossId,
    planName: `${planName} (draft)`,
    partyComp,
    placements,
    isDraft: true,
    sourcePlanId,
  });
  return draftId;
}

/**
 * Removes the current draft, if one exists. Safe to call when there is none.
 */
export function deleteDraft() {
  const draft = getDraft();
  if (draft) {
    deletePlan(draft.planId);
  }
}

/**
 * Commits a draft onto the plan it was forked from, preserving that plan's
 * other metadata (planName, bossId), then removes the draft. Only valid for
 * drafts with a sourcePlanId — from-scratch drafts go through Save As instead.
 * @param {Object} draft - The draft to commit, as returned by getDraft().
 */
export function commitDraft(draft) {
  if (!draft.sourcePlanId) {
    throw new Error("Cannot commit a draft with no sourcePlanId");
  }
  const original = loadPlan(draft.sourcePlanId);
  savePlan(draft.sourcePlanId, {
    ...original,
    partyComp: draft.partyComp,
    placements: draft.placements,
    isDraft: false,
  });
  deleteDraft();
}

export function exportPlan(plan) {
  const dataStr = JSON.stringify(plan, null, 2);
  const blob = new Blob([dataStr], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `${plan.planName || "mitigation-plan"}.json`;
  a.click();

  URL.revokeObjectURL(url);
}

export function importPlan(file, callback) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = JSON.parse(e.target.result);
      callback(data);
    } catch (error) {
      console.error("Error importing plan:", error);
      openDialog({ body: "Failed to import plan. Invalid file format." });
    }
  };
  reader.readAsText(file);
}
