import React, { useState, useEffect } from "react";
import PartyComposition from "./components/PartyComposition";
import PlayerSelector from "./components/PlayerSelector";
import PlayerAbilities from "./components/PlayerAbilities";
import Timeline from "./components/Timeline";
import TimelineControls from "./components/TimelineControls";
import { JOBS } from "./data/jobs";
import { BOSS_TIMELINES, PIXELS_PER_SECOND } from "./data/bossTimelines";
import { getAbilitiesForSlot } from "./utils/cooldownCalculations";
import { loadPlan, savePlan } from "./utils/planStorage";
import { useDragPlacement } from "./hooks/useDragPlacement";

export default function MitigationPlanner() {
  const [partyComp, setPartyComp] = useState({
    tank1: "PLD",
    tank2: "WAR",
    healer1: "AST",
    healer2: "SCH",
    dps1: "DRG",
    dps2: "RDM",
    dps3: "BRD",
    dps4: "PCT",
  });

  const [placements, setPlacements] = useState([]);
  const [currentTimeline, setCurrentTimeline] = useState("dancing-green");
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const [zoom, setZoom] = useState(4);
  const [selectedSlot, setSelectedSlot] = useState("tank1");

  const timeline = BOSS_TIMELINES[currentTimeline];
  const pixelsPerSecond = PIXELS_PER_SECOND * (zoom / 4);
  const selectedAbilities = getAbilitiesForSlot(partyComp, selectedSlot, JOBS);

  const {
    draggedAbility,
    draggedFrom,
    dragPreview,
    handleDragStart,
    handleDragOver,
    handleDragLeave,
    handleDropOnRow,
  } = useDragPlacement({
    placements,
    setPlacements,
    timelineDuration: timeline.duration,
    pixelsPerSecond,
  });

  // Auto-save when placements or party comp changes
  useEffect(() => {
    if (currentPlanId) {
      const planData = loadPlan(currentPlanId);
      if (planData) {
        savePlan(currentPlanId, {
          ...planData,
          partyComp,
          placements,
        });
      }
    }
  }, [placements, partyComp, currentPlanId]);

  const handleTimelineChange = (newTimeline) => {
    setCurrentTimeline(newTimeline);
    setCurrentPlanId(null);
    setPlacements([]);
  };

  const handlePlanChange = (planId) => {
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

  const removePlacement = (placementId) => {
    setPlacements(placements.filter((p) => p.placementId !== placementId));
  };

  const clearAll = () => {
    if (confirm("Clear all abilities from the timeline?")) {
      setPlacements([]);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      <div className="max-w-7xl mx-auto">
        <TimelineControls
          currentTimeline={currentTimeline}
          onTimelineChange={handleTimelineChange}
          availableTimelines={BOSS_TIMELINES}
          currentPlanId={currentPlanId}
          onPlanChange={handlePlanChange}
          partyComp={partyComp}
          placements={placements}
        />

        <PartyComposition partyComp={partyComp} setPartyComp={setPartyComp} />

        <PlayerSelector
          partyComp={partyComp}
          selectedSlot={selectedSlot}
          onSelectSlot={setSelectedSlot}
        />

        <PlayerAbilities
          selectedSlot={selectedSlot}
          partyComp={partyComp}
          abilities={selectedAbilities}
          onDragStart={handleDragStart}
        />

        <Timeline
          timeline={timeline}
          placements={placements}
          partyComp={partyComp}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDropOnRow={handleDropOnRow}
          onDragStart={handleDragStart}
          onRemovePlacement={removePlacement}
          pixelsPerSecond={pixelsPerSecond}
          zoom={zoom}
          onZoomChange={setZoom}
          draggedAbility={draggedAbility}
          dragPreview={dragPreview}
          draggedFrom={draggedFrom}
          onClearAll={clearAll}
        />
      </div>
    </div>
  );
}
