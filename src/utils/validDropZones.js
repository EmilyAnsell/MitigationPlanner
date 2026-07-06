import { canPlaceChargeAt } from "./cooldownCalculations";

/**
 * Calculate valid drop zones for an ability considering cooldown conflicts
 * Returns an array of time ranges where the ability can be placed
 */
export function calculateValidDropZones(
  placements,
  ability,
  timelineDuration,
  excludePlacementId = null,
  prepullVisibleSeconds = 0,
) {
  if (!ability) return [{ start: 0, end: timelineDuration }];

  // Get all existing placements of this ability (excluding the one being moved)
  const existingPlacements = placements
    .filter(
      (p) =>
        p.slot === ability.slot &&
        p.id === ability.id &&
        p.placementId !== excludePlacementId,
    )
    .sort((a, b) => a.startTime - b.startTime);

  // If no existing placements, entire timeline is valid
  if (existingPlacements.length === 0) {
    return [
      {
        start: -prepullVisibleSeconds,
        end: timelineDuration - ability.duration,
      },
    ];
  }

  const maxCharges = ability.charges || 1;

  // Single-charge abilities
  if (maxCharges === 1) {
    return calculateSimpleValidZones(
      existingPlacements,
      ability,
      timelineDuration,
      prepullVisibleSeconds,
    );
  }

  // Multi-charge abilities
  return calculateMultiChargeValidZones(
    existingPlacements,
    ability,
    timelineDuration,
    maxCharges,
    prepullVisibleSeconds,
  );
}

/**
 * Calculate valid zones for single-charge abilities
 */
function calculateSimpleValidZones(
  existingPlacements,
  ability,
  timelineDuration,
  prepullVisibleSeconds = 0,
) {
  const validZones = [];
  const maxEndTime = timelineDuration;

  // For each existing placement, it blocks:
  // - From (startTime - cooldown) to startTime
  // - From startTime to (startTime + cooldown)
  const blockedRanges = existingPlacements.map((p) => ({
    start: Math.max(-prepullVisibleSeconds, p.startTime - ability.cooldown),
    end: Math.min(maxEndTime, p.startTime + ability.cooldown),
  }));

  // Sort and merge overlapping blocked ranges
  const mergedBlocked = mergeRanges(blockedRanges);

  // Valid zones are the gaps between blocked ranges
  let currentStart = -prepullVisibleSeconds;

  for (const blocked of mergedBlocked) {
    if (currentStart < blocked.start) {
      validZones.push({ start: currentStart, end: blocked.start });
    }
    currentStart = Math.max(currentStart, blocked.end);
  }

  // Add final zone after last blocked range
  if (currentStart <= maxEndTime) {
    validZones.push({ start: currentStart, end: maxEndTime });
  }

  return validZones;
}

/**
 * Merge overlapping ranges
 */
function mergeRanges(ranges) {
  if (ranges.length === 0) return [];

  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const last = merged[merged.length - 1];

    if (current.start <= last.end) {
      // Overlapping ranges, merge them
      last.end = Math.max(last.end, current.end);
    } else {
      // Non-overlapping, add as new range
      merged.push(current);
    }
  }

  return merged;
}

/**
 * Calculate valid zones for multi-charge abilities
 * Tests every second of the timeline to see if placement would be valid
 */
function calculateMultiChargeValidZones(
  existingPlacements,
  ability,
  timelineDuration,
  maxCharges,
  prepullVisibleSeconds = 0,
) {
  const maxEndTime = timelineDuration;
  const validZones = [];
  let currentZoneStart = null;

  // Test each second of the timeline
  for (let time = -prepullVisibleSeconds; time <= maxEndTime; time++) {
    const isValid = canPlaceChargeAt(
      existingPlacements,
      ability,
      time,
      maxCharges,
      -prepullVisibleSeconds,
    );

    if (isValid) {
      // Start new zone or continue existing one
      if (currentZoneStart === null) {
        currentZoneStart = time;
      }
    } else {
      // End current zone if one exists
      if (currentZoneStart !== null) {
        validZones.push({ start: currentZoneStart, end: time - 1 });
        currentZoneStart = null;
      }
    }
  }

  // Close final zone if still open
  if (currentZoneStart !== null) {
    validZones.push({ start: currentZoneStart, end: maxEndTime });
  }

  return validZones;
}

/**
 * Snap a time value to the end of an ability's cooldown if placed within an invalid zone.
 */
export function snapToValidZone(time, validZones, _ability) {
  // TODO - better way to handle no valid zones? For now, just return the time as-is
  if (!validZones || validZones.length === 0) return time;

  // Check if we're in a valid zone
  for (const zone of validZones) {
    if (time >= zone.start && time <= zone.end) {
      // Already in valid zone, no snapping needed
      return time;
    }

    // If time is before this zone, snap to zone start
    if (time < zone.start) {
      return zone.start;
    }
  }

  // If we're past all zones, return the time as-is (allow beyond timeline)
  const lastZone = validZones[validZones.length - 1];
  return Math.max(time, lastZone.end);
}
