import { useState } from "react";
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
import { useDragPlacement } from "./hooks/useDragPlacement";
import { usePlanSelection } from "./hooks/usePlanSelection";
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
  const [zoom, setZoom] = useState(4);
  const [selectedSlot, setSelectedSlot] = useState("tank1");

  const prepullVisibleSeconds = prepullVisible ? PRE_PULL_TIMER_DURATION : 0;
  const pixelsPerSecond = PIXELS_PER_SECOND * (zoom / 4);
  const selectedAbilities = getAbilitiesForSlot(partyComp, selectedSlot, JOBS);

  // Edit-wrapped setters: every genuine edit persists via handleAutosave. Loads
  // (in usePlanSelection) use the raw setters and never autosave, so selecting a
  // plan or draft can't fork one.
  const editPlacements = (next) => {
    setPlacements(next);
    handleAutosave({ partyComp, placements: next });
  };
  const editPartyComp = (next) => {
    setPartyComp(next);
    handleAutosave({ partyComp: next, placements });
  };
  const removePlacement = (placementId) => {
    editPlacements(placements.filter((p) => p.placementId !== placementId));
  };

  const {
    currentTimeline,
    currentPlanId,
    timeline,
    handleTimelineChange,
    handlePlanChange,
    handleAutosave,
  } = usePlanSelection({ partyComp, setPartyComp, setPlacements });

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
    editPlacements,
    timelineDuration: timeline.duration,
    pixelsPerSecond,
    prepullVisibleSeconds,
  });

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
        editPlacements(placements.filter((p) => p.slot !== slot));
        onCleared();
        return;
      }
      openDialog({
        header: "Job Swap",
        body: `Clear non-role abilities from ${JOBS[partyComp[slot]]?.name || slot}?`,
        buttons: [
          { label: "Cancel", variant: "secondary", onClick: closeDialog },
          {
            label: "Continue",
            variant: "danger",
            onClick: () => {
              closeDialog();
              editPlacements(
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
        { label: "Cancel", variant: "secondary", onClick: closeDialog },
        {
          label: "Clear All",
          variant: "danger",
          onClick: () => {
            closeDialog();
            editPlacements([]);
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
          editPartyComp={editPartyComp}
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
