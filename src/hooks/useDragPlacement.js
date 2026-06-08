import { useState, useEffect } from "react";
import { checkCooldownConflict } from "../utils/cooldownCalculations";
import {
  snapToValidZone,
  calculateValidDropZones,
} from "../utils/validDropZones";

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

  const handleDragStart = (ability, from = "palette", clickOffset = 0) => {
    setDraggedAbility(ability);
    setDraggedFrom(from);
    setDragOffset(clickOffset);
    setIsDraggingOnTimeline(false);
  };

  const snapToGrid = (time) => {
    return Math.round(time);
  };

  const completePlacement = (startTime, slot) => {
    if (!draggedAbility || draggedAbility.slot !== slot) {
      return false;
    }

    if (startTime < 0 || startTime > timelineDuration) {
      return false;
    }

    const excludeId =
      draggedFrom === "timeline" ? draggedAbility.placementId : null;
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

    if (draggedAbility.slot !== slot) {
      setDraggedAbility(null);
      setDraggedFrom(null);
      setDragOffset(0);
      return;
    }

    let startTime;
    if (previewToUse && previewToUse.slot === slot) {
      const excludeId =
        draggedFrom === "timeline" ? draggedAbility.placementId : null;
      const validZones = calculateValidDropZones(
        placements,
        draggedAbility,
        timelineDuration,
        excludeId
      );
      startTime = snapToValidZone(
        previewToUse.startTime,
        validZones,
        draggedAbility
      );
    } else {
      const rowRect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rowRect.left;
      const rawTime = Math.max(0, x / pixelsPerSecond);
      const unsnappedTime = Math.max(0, snapToGrid(rawTime - dragOffset));

      // Snap to valid zones
      const excludeId =
        draggedFrom === "timeline" ? draggedAbility.placementId : null;
      const validZones = calculateValidDropZones(
        placements,
        draggedAbility,
        timelineDuration,
        excludeId
      );
      startTime = snapToValidZone(unsnappedTime, validZones, draggedAbility);
    }

    if (completePlacement(startTime, slot)) {
      setDraggedAbility(null);
      setDraggedFrom(null);
      setDragOffset(0);
    } else {
      setDraggedAbility(null);
      setDraggedFrom(null);
      setDragOffset(0);
    }
  };

  // Global drop handler
  useEffect(() => {
    const handleGlobalDrop = (e) => {
      if (isDraggingOnTimeline && draggedAbility && dragPreview) {
        e.preventDefault();

        const slot = draggedAbility.slot;

        // Snap the preview time to valid zones before placing
        const excludeId =
          draggedFrom === "timeline" ? draggedAbility.placementId : null;
        const validZones = calculateValidDropZones(
          placements,
          draggedAbility,
          timelineDuration,
          excludeId
        );
        const startTime = snapToValidZone(
          dragPreview.startTime,
          validZones,
          draggedAbility
        );

        setDragPreview(null);
        setIsDraggingOnTimeline(false);

        if (completePlacement(startTime, slot)) {
          setDraggedAbility(null);
          setDraggedFrom(null);
          setDragOffset(0);
        } else {
          setDraggedAbility(null);
          setDraggedFrom(null);
          setDragOffset(0);
        }
      }
    };

    const handleGlobalDragEnd = (e) => {
      if (draggedAbility) {
        setDraggedAbility(null);
        setDraggedFrom(null);
        setDragPreview(null);
        setIsDraggingOnTimeline(false);
        setDragOffset(0);
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
