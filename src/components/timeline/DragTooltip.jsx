import { formatTime } from "../../utils/cooldownCalculations";
import { calculateAbilityLanes } from "../../utils/laneCalculations";
import { timeToX } from "../../utils/timelineCoordinates";
import { ROW_HEIGHT } from "../../data/bossTimelines";

export default function DragTooltip({
  dragPreview,
  draggedAbility,
  pixelsPerSecond,
  labelWidth,
  placements,
  draggedFrom,
  prepullVisibleSeconds,
}) {
  if (!dragPreview || !draggedAbility) {
    return null;
  }

  // Calculate lane to match the preview positioning
  const tempPlacement = {
    ...draggedAbility,
    startTime: dragPreview.startTime,
    placementId: "temp-preview",
  };

  const filteredPlacements =
    draggedFrom === "timeline"
      ? placements.filter((p) => p.placementId !== draggedAbility.placementId)
      : placements;

  const placementsWithPreview = [...filteredPlacements, tempPlacement];
  const placementsWithLanes = calculateAbilityLanes(placementsWithPreview);

  const previewWithLane = placementsWithLanes.find(
    (p) => p.placementId === "temp-preview",
  );

  // Calculate lane position
  let laneTop = 10;
  if (previewWithLane) {
    const totalLanes = previewWithLane.totalLanes;
    const laneHeight = (ROW_HEIGHT - 20) / totalLanes;
    laneTop = 10 + previewWithLane.lane * laneHeight;
  }

  return (
    <div
      className="absolute z-20 px-2 py-1 text-xs bg-gray-900 border border-gray-600 rounded pointer-events-none whitespace-nowrap"
      style={{
        left: `${timeToX(dragPreview.startTime, prepullVisibleSeconds, pixelsPerSecond) + labelWidth - 10}px`,
        top: `${laneTop}px`,
        transform: "translateX(-100%)",
      }}
    >
      {formatTime(dragPreview.startTime)} -{" "}
      {formatTime(dragPreview.startTime + draggedAbility.duration)}
    </div>
  );
}
