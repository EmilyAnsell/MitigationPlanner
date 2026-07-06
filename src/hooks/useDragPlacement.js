import { useState, useEffect, useCallback } from "react";
import { checkCooldownConflict } from "../utils/cooldownCalculations";
import {
  snapToValidZone,
  calculateValidDropZones,
} from "../utils/validDropZones";

/**
 * Rounds a raw timeline position to the nearest whole-second grid line
 * @param {number} time - Raw time in seconds
 * @returns {number} - Time rounded to the nearest second
 */
function snapToGrid(time) {
  return Math.round(time);
}

/**
 * Snaps a candidate drop time to the nearest valid (non-conflicting) zone for an ability
 * @param {number} time - Candidate start time in seconds
 * @param {Array} placements - Existing placements on the timeline
 * @param {Object} ability - Ability being placed
 * @param {number} timelineDuration - Total timeline duration in seconds
 * @param {number|null} excludePlacementId - Placement ID to ignore when checking conflicts (the ability's own existing placement, when moving it)
 * @returns {number} - Start time snapped to the nearest valid zone
 */
function resolveDropTime({
  time,
  placements,
  ability,
  timelineDuration,
  excludePlacementId,
  prepullVisibleSeconds,
}) {
  const validZones = calculateValidDropZones(
    placements,
    ability,
    timelineDuration,
    excludePlacementId,
    prepullVisibleSeconds,
  );
  return snapToValidZone(time, validZones, ability);
}

// Pure helpers — no hook state, so kept at module scope rather than recreated per render.

/**
 * Manages drag-and-drop state and handlers for placing abilities on the timeline,
 * from both the ability palette and existing timeline placements
 * @param {Array} placements - Current placements on the timeline
 * @param {Function} setPlacements - Setter for the placements array
 * @param {number} timelineDuration - Total timeline duration in seconds
 * @param {number} pixelsPerSecond - Current horizontal scale of the timeline
 * @returns {Object} - Drag state (draggedAbility, draggedFrom, dragPreview) and handlers (handleDragStart, handleDragOver, handleDragLeave, handleDropOnRow)
 */
export function useDragPlacement({
  placements,
  setPlacements,
  timelineDuration,
  pixelsPerSecond,
  prepullVisibleSeconds,
}) {
  const [draggedAbility, setDraggedAbility] = useState(null);
  const [draggedFrom, setDraggedFrom] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [isDraggingOnTimeline, setIsDraggingOnTimeline] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

  const minTime = -prepullVisibleSeconds;

  /**
   * resetDrag - applies common setting to null for the multiple times drag is reset in this hook
   * The following are typically also reset before this, but not consistently.
   * Further investigation could reveal if it's fine to add these here and remove repeats in code.
   * setDragPreview(null);
   * setIsDraggingOnTimeline(false);
   */
  const resetDrag = () => {
    setDraggedAbility(null);
    setDraggedFrom(null);
    setDragOffset(0);
  };

  const getExcludePlacementId = useCallback(
    () => (draggedFrom === "timeline" ? draggedAbility.placementId : null),
    [draggedFrom, draggedAbility],
  );

  const handleDragStart = (ability, from = "palette", clickOffset = 0) => {
    setDraggedAbility(ability);
    setDraggedFrom(from);
    setDragOffset(clickOffset);
    setIsDraggingOnTimeline(false);
  };

  const completePlacement = useCallback(
    (startTime) => {
      if (!draggedAbility) {
        return false;
      }

      if (startTime < minTime || startTime > timelineDuration) {
        return false;
      }

      const excludeId = getExcludePlacementId();
      const hasConflict = checkCooldownConflict(
        placements,
        draggedAbility,
        startTime,
        excludeId,
      );

      if (!hasConflict) {
        if (draggedFrom === "palette") {
          setPlacements([
            ...placements,
            {
              ...draggedAbility,
              startTime,
              placementId: Date.now() + Math.random(),
            },
          ]);
        } else if (draggedFrom === "timeline") {
          setPlacements(
            placements.map((p) =>
              p.placementId === draggedAbility.placementId
                ? { ...p, startTime }
                : p,
            ),
          );
        }
        return true;
      }
      return false;
    },
    [
      draggedAbility,
      draggedFrom,
      timelineDuration,
      placements,
      setPlacements,
      getExcludePlacementId,
      minTime,
    ],
  );

  const handleDragOver = (e) => {
    e.preventDefault();

    setIsDraggingOnTimeline(true);

    if (draggedAbility) {
      const rowRect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rowRect.left;
      const rawTime = Math.max(minTime, x / pixelsPerSecond + minTime);
      const startTime = Math.min(
        Math.max(minTime, snapToGrid(rawTime - dragOffset)),
        timelineDuration,
      );

      setDragPreview({
        startTime,
        slot: draggedAbility.slot,
      });
    }
  };

  const handleDragLeave = (e) => {
    if (
      e.currentTarget === e.target ||
      !e.currentTarget.contains(e.relatedTarget)
    ) {
      setDragPreview(null);
    }
  };

  const handleDropOnRow = (e) => {
    e.preventDefault();
    e.stopPropagation();

    const previewToUse = dragPreview;

    setDragPreview(null);
    setIsDraggingOnTimeline(false);

    if (!draggedAbility || !previewToUse) {
      resetDrag();
      return;
    }

    const startTime = resolveDropTime({
      time: previewToUse.startTime,
      placements,
      ability: draggedAbility,
      timelineDuration,
      excludePlacementId: getExcludePlacementId(),
      prepullVisibleSeconds,
    });

    completePlacement(startTime);
    resetDrag();
  };

  // Global drop handler
  useEffect(() => {
    const handleGlobalDrop = (e) => {
      if (isDraggingOnTimeline && draggedAbility && dragPreview) {
        e.preventDefault();

        const startTime = resolveDropTime({
          time: dragPreview.startTime,
          placements,
          ability: draggedAbility,
          timelineDuration,
          excludePlacementId: getExcludePlacementId(),
          prepullVisibleSeconds,
        });

        setDragPreview(null);
        setIsDraggingOnTimeline(false);

        completePlacement(startTime);
        resetDrag();
      }
    };

    const handleGlobalDragEnd = () => {
      if (draggedAbility) {
        resetDrag();
        setDragPreview(null);
        setIsDraggingOnTimeline(false);
      }
    };

    document.addEventListener("drop", handleGlobalDrop);
    document.addEventListener("dragend", handleGlobalDragEnd);

    return () => {
      document.removeEventListener("drop", handleGlobalDrop);
      document.removeEventListener("dragend", handleGlobalDragEnd);
    };
  }, [
    isDraggingOnTimeline,
    draggedAbility,
    dragPreview,
    draggedFrom,
    placements,
    timelineDuration,
    pixelsPerSecond,
    completePlacement,
    getExcludePlacementId,
    prepullVisibleSeconds,
  ]);

  return {
    draggedAbility,
    draggedFrom,
    dragPreview,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDropOnRow,
  };
}
