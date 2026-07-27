import { useState, useEffect } from "react";
import PartyComposition from "./components/PartyComposition";
import PlayerSelector from "./components/PlayerSelector";
import PlayerAbilities from "./components/PlayerAbilities";
import Timeline from "./components/Timeline";
import TimelineControls from "./components/TimelineControls";
import GlobalDialog from "./components/dialog/GlobalDialog";
import { JOBS } from "./data/jobs";
import {
  BOSS_TIMELINES,
  PIXELS_PER_SECOND,
  PRE_PULL_TIMER_DURATION,
} from "./data/bossTimelines";
import { getAbilitiesForSlot } from "./utils/cooldownCalculations";
import { loadPlan, savePlan } from "./utils/planStorage";
import { useDragPlacement } from "./hooks/useDragPlacement";
import { closeDialog, openDialog } from "./utils/dialogStore";

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
  const [prepullVisible, setPrepullVisible] = useState(false);
  const [currentTimeline, setCurrentTimeline] = useState("dancing-green");
  const [currentPlanId, setCurrentPlanId] = useState(null);
  const [zoom, setZoom] = useState(4);
  const [selectedSlot, setSelectedSlot] = useState("tank1");

  const timeline = BOSS_TIMELINES[currentTimeline];
  const prepullVisibleSeconds = prepullVisible ? PRE_PULL_TIMER_DURATION : 0;
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
    prepullVisibleSeconds,
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

  /**
   * Clears ability placements from a party slot, then runs `onCleared`.
   * @param {string} slot - Party slot key (e.g. "tank1")
   * @param {boolean} [isWithinRoleSwap=false] - When true, prompts for confirmation and preserves role abilities whose sub-role matches `role`; when false, clears all placements without prompting
   * @param {string|null} [role=null] - Sub-role of the incoming job (e.g. "Tank", "Melee", "Magical_Ranged"); null (e.g. swapping to "None") preserves nothing
   * @param {() => void} [onCleared=() => {}] - Called once the row has actually been cleared (immediately, or after the user confirms); never called if the user cancels
   */
  const clearRow = (
    slot,
    isWithinRoleSwap = false,
    role = null,
    onCleared = () => {},
  ) => {
    if (placements.some((p) => p.slot === slot)) {
      if (!isWithinRoleSwap) {
        setPlacements(placements.filter((p) => p.slot !== slot));
        onCleared();
        return;
      }
      openDialog({
        header: "Job Swap",
        body: `Clear non-role abilities from ${JOBS[partyComp[slot]]?.name || slot}?`,
        buttons: [
          { label: "Cancel", onClick: closeDialog },
          {
            label: "Continue",
            onClick: () => {
              closeDialog();
              setPlacements(
                placements.filter(
                  (p) => p.slot !== slot || p.roleAbility === role,
                ),
              );
              onCleared();
            },
          },
        ],
      });
      return;
    }
    onCleared(); // No placements in the slot, nothing to confirm
  };

  const clearAll = () => {
    openDialog({
      body: "Clear all abilities from the timeline?",
      buttons: [
        { label: "Cancel", onClick: closeDialog },
        {
          label: "Clear All",
          onClick: () => {
            closeDialog();
            setPlacements([]);
          },
        },
      ],
    });
  };

  /**
   * Toggle the visibility of the prepull timer on the timeline.
   * If any abilities are placed in the prepull section, the section they are active for will be hidden, but the placements will remain.
   */
  const handleTogglePrepull = () => {
    setPrepullVisible((v) => !v);
  };

  return (
    <div className="min-h-screen p-6 text-white bg-gray-900">
      <div className="mx-auto max-w-7xl">
        <GlobalDialog />

        <TimelineControls
          currentTimeline={currentTimeline}
          onTimelineChange={handleTimelineChange}
          availableTimelines={BOSS_TIMELINES}
          currentPlanId={currentPlanId}
          onPlanChange={handlePlanChange}
          partyComp={partyComp}
          placements={placements}
        />

        <PartyComposition
          partyComp={partyComp}
          setPartyComp={setPartyComp}
          onClearRow={clearRow}
        />

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
          prepullVisibleSeconds={prepullVisibleSeconds}
          onTogglePrepull={handleTogglePrepull}
          onClearRow={clearRow}
        />
      </div>
    </div>
  );
}
