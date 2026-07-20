import { getJobAbilities } from "../data/jobs";

/**
 * Tests whether a single or multi-charge ability can be used at a given time,
 * simulating charge consumption and recharge across all placements.
 * @param {Array} existingPlacements - Other placements of this ability, any order
 * @param {Object} ability - Ability with charges and cooldown
 * @param {number} testTime - Candidate start time in seconds (negative = prepull)
 * @param {number} maxCharges - Maximum number of charges. Defaults to 1 for single-charge abilities.
 * @returns {boolean} - True if a charge is available at testTime
 */
export function canPlaceAbilityAt(
  existingPlacements,
  ability,
  testTime,
  maxCharges = 1,
) {
  const allPlacements = [
    ...existingPlacements,
    { startTime: testTime, placementId: "temp" },
  ].sort((a, b) => a.startTime - b.startTime);

  let currentCharges = maxCharges;
  let lastRechargeCheckTime = allPlacements[0].startTime;

  for (const placement of allPlacements) {
    // Calculate how many charges have recharged since last check
    const timePassed = placement.startTime - lastRechargeCheckTime;
    const chargesRecharged = Math.floor(timePassed / ability.cooldown);

    // Add recharged charges, but don't exceed max
    currentCharges = Math.min(maxCharges, currentCharges + chargesRecharged);

    // Update last recharge check time based on actual recharges
    if (chargesRecharged > 0) {
      lastRechargeCheckTime =
        lastRechargeCheckTime + chargesRecharged * ability.cooldown;
    }

    // Try to use a charge
    if (currentCharges > 0) {
      currentCharges--;
    } else {
      // Inserting testTime here starves a later placement (existing or new) of a charge
      return false;
    }
  }

  return true;
}

/**
 * Determines whether placing an ability at a given time conflicts with its existing placements. Handles both single-charge and multi-charge abilities.
 * @param {Array} placements - All current placements on the timeline
 * @param {Object} ability - Ability being placed, with slot, id, cooldown, and optional charges
 * @param {number} startTime - Candidate start time in seconds
 * @param {number|null} excludePlacementId - Placement ID to ignore when checking conflicts (the ability's own existing placement, when moving it)
 * @returns {boolean} - True if placing at startTime would conflict with an existing placement
 */
export function hasCooldownConflict(
  placements,
  ability,
  startTime,
  excludePlacementId = null,
) {
  const jobPlacements = placements
    .filter(
      (p) =>
        p.slot === ability.slot &&
        p.id === ability.id &&
        p.placementId !== excludePlacementId,
    )
    .sort((a, b) => a.startTime - b.startTime); // Sort by time

  // Use logic in canPlaceAbilityAt to determine if an ability can be placed - covered single and multi-charge abilities
  const maxCharges = ability.charges || 1;
  return !canPlaceAbilityAt(jobPlacements, ability, startTime, maxCharges);
}

/**
 * Resolves the list of abilities available to a party slot, based on the job assigned to it.
 * @param {Object} partyComp - Map of party slot key to selected job ID (or null)
 * @param {string} slot - Party slot key (e.g. "tank1")
 * @param {Object} jobs - JOBS object keyed by job ID
 * @returns {Array} - Abilities for the slot's job, each annotated with jobId, jobName, color, and slot
 */
export function getAbilitiesForSlot(partyComp, slot, jobs) {
  const jobId = partyComp[slot];
  if (!jobId || !jobs[jobId]) return [];

  const job = jobs[jobId];
  const allAbilities = getJobAbilities(jobId);

  return allAbilities.map((ability) => ({
    ...ability,
    jobId,
    jobName: job.name,
    color: job.color,
    slot,
  }));
}

/**
 * Formats a time in seconds as a m:ss timestamp, prefixing with "-" for negative (pre-pull) times.
 * @param {number} seconds - Time in seconds; negative values represent pre-pull time
 * @returns {string} - Formatted timestamp, e.g. "1:05" or "-0:04"
 */
export function formatTime(seconds) {
  // Handle negative times for prepull
  const negative = seconds < 0;
  const absSeconds = Math.abs(seconds);
  const mins = Math.floor(absSeconds / 60);
  const secs = absSeconds % 60;
  return `${negative ? "-" : ""}${mins}:${String(secs).padStart(2, "0")}`;
}

/**
 * Get the effective duration of an ability, clipped to timeline end.
 * @param {Object} placement - Placed ability with startTime and duration
 * @param {number} timelineDuration - Total timeline duration in seconds
 * @returns {number} - Duration in seconds, shortened if the placement would otherwise extend past the timeline end
 */
export function getEffectiveDuration(placement, timelineDuration) {
  const endTime = placement.startTime + placement.duration;
  if (endTime > timelineDuration) {
    return timelineDuration - placement.startTime;
  }
  return placement.duration;
}
