import { useState, useEffect } from "react";
import { checkCooldownConflict } from "../utils/cooldownCalculations";
import {
  snapToValidZone,
  calculateValidDropZones,
} from "../utils/validDropZones";

const snapToGrid = (time) => Math.round(time);

const resolveDropTime = ({
  time,
  placements,
  ability,
  timelineDuration,
  excludePlacementId,
}) => {
  const validZones = calculateValidDropZones(
    placements,
    ability,
    timelineDuration,
    excludePlacementId
  );
  return snapToValidZone(time, validZones, ability);
};

// Above helper functions left outside of returned hook since they do not require the state of the hook. May wish to see if it could be slightly beneficial to move others out, or these in.

export function useDragPlacement({
  placements,
  setPlacements,
  timelineDuration,
  pixelsPerSecond,
}) {
  const [draggedAbility, setDraggedAbility] = useState(null);
  const [draggedFrom, setDraggedFrom] = useState(null);
  const [dragPreview, setDragPreview] = useState(null);
  const [isDraggingOnTimeline, setIsDraggingOnTimeline] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);

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

  const getExcludePlacementId = () =>
    draggedFrom === "timeline" ? draggedAbility.placementId : null;

  const handleDragStart = (ability, from = "palette", clickOffset = 0) => {
    setDraggedAbility(ability);
    setDraggedFrom(from);
    setDragOffset(clickOffset);
    setIsDraggingOnTimeline(false);
  };

  const completePlacement = (startTime, slot) => {
    if (!draggedAbility || draggedAbility.slot !== slot) {
      return false;
    }

    if (startTime < 0 || startTime > timelineDuration) {
      return false;
    }

    const excludeId = getExcludePlacementId();
    const hasConflict = checkCooldownConflict(
      placements,
      draggedAbility,
      startTime,
      excludeId
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
              : p
          )
        );
      }
      return true;
    }
    return false;
  };

  const handleDragOver = (e) => {
    e.preventDefault();

    setIsDraggingOnTimeline(true);

    if (draggedAbility) {
      const rowRect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rowRect.left;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      const startTime = snapToGrid(rawTime - dragOffset);

      // Only check if start time is within timeline bounds
      if (startTime >= 0 && startTime <= timelineDuration) {
        setDragPreview({
          startTime,
          slot: draggedAbility.slot,
        });
      } else {
        setDragPreview(null);
      }
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

  const handleDropOnRow = (e, slot) => {
    e.preventDefault();
    e.stopPropagation();

    const previewToUse = dragPreview;

    setDragPreview(null);
    setIsDraggingOnTimeline(false);

    if (!draggedAbility) return;

    // TODO: allow dropping when mouse hovered over another slot (preview should still display in character's slot)
    if (draggedAbility.slot !== slot) {
      resetDrag();
      return;
    }

    const excludePlacementId = getExcludePlacementId();
    let time;
    if (previewToUse && previewToUse.slot === slot) {
      time = previewToUse.startTime;
    } else {
      const rowRect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rowRect.left;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      time = Math.max(0, snapToGrid(rawTime - dragOffset));
    }

    const startTime = resolveDropTime({
      time,
      placements,
      ability: draggedAbility,
      timelineDuration,
      excludePlacementId,
    });

    completePlacement(startTime, slot);
    resetDrag();
  };

  // Global drop handler
  useEffect(() => {
    const handleGlobalDrop = (e) => {
      if (isDraggingOnTimeline && draggedAbility && dragPreview) {
        e.preventDefault();

        const slot = draggedAbility.slot;
        const startTime = resolveDropTime({
          time: dragPreview.startTime,
          placements,
          ability: draggedAbility,
          timelineDuration,
          excludePlacementId:
            draggedFrom === "timeline" ? draggedAbility.placementId : null
        });

        setDragPreview(null);
        setIsDraggingOnTimeline(false);

        completePlacement(startTime, slot);
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
