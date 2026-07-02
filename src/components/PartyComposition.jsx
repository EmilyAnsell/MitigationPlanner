import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { JOBS, PARTY_SLOTS, SLOT_LABELS } from "../data/jobs";

/**
 * Collapsible panel for choosing which job fills each of the 8 party slots.
 * Each slot renders a job dropdown filtered to the roles valid for that slot,
 * and swapping a job clears the row's incompatible placements via `onClearRow`.
 * @param {Object} props
 * @param {Object} props.partyComp - Map of party slot key to selected job ID (or null)
 * @param {(comp: Object) => void} props.setPartyComp - Setter for the party composition
 * @param {(slot: string, isRoleSwap?: boolean, role?: string|null) => boolean} props.onClearRow - Clears a row on job swap; returns false if the user cancels, which aborts the swap
 * @returns {JSX.Element}
 */
export default function PartyComposition({
  partyComp,
  setPartyComp,
  onClearRow,
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  /**
   * Maps a party slot key to its broad role category used for job filtering.
   * @param {string} slot - Party slot key (e.g. "tank1", "healer2", "dps3")
   * @returns {"Tank"|"Healer"|"DPS"|null} The slot's role category, or null if unrecognised
   */
  const getSlotRole = (slot) => {
    if (slot.startsWith("tank")) return "Tank";
    if (slot.startsWith("healer")) return "Healer";
    if (slot.startsWith("dps")) return "DPS";
    return null;
  };

  /**
   * Jobs grouped by role category and sub-category (e.g. Melee/Physical Ranged),
   * shaped for rendering `<optgroup>`s in the slot dropdowns. Memoised with no
   * deps since `JOBS` is static.
   * @type {Object<string, Object<string, Array<[string, Object]>>>}
   */
  const getJobsByCategory = useMemo(() => {
    const tanks = Object.entries(JOBS).filter(
      ([_, job]) => job.role === "Tank",
    );
    const healers = Object.entries(JOBS).filter(
      ([_, job]) => job.role === "Healer",
    );
    const melee = Object.entries(JOBS).filter(
      ([_, job]) => job.role === "Melee",
    );
    const physicalRanged = Object.entries(JOBS).filter(
      ([_, job]) => job.role === "Physical_Ranged",
    );
    const magicalRanged = Object.entries(JOBS).filter(
      ([_, job]) => job.role === "Magical_Ranged",
    );

    return {
      Tank: { Tanks: tanks },
      Healer: { Healers: healers },
      DPS: {
        Melee: melee,
        "Physical Ranged": physicalRanged,
        "Magical Ranged": magicalRanged,
      },
    };
  }, []);

  return (
    <div className="p-4 mb-6 bg-gray-800 rounded-lg">
      <div
        className="flex items-center justify-between cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <h2 className="text-xl font-semibold">Party Composition</h2>
        <button className="p-1 rounded hover:bg-gray-700">
          {isExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
        </button>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-4 gap-3 mt-3">
          {PARTY_SLOTS.map((slot) => {
            const slotRole = getSlotRole(slot);
            const jobCategories = getJobsByCategory[slotRole] || {};

            return (
              <div key={slot}>
                <label className="block mb-1 text-sm text-gray-400">
                  {SLOT_LABELS[slot]}
                </label>
                <select
                  value={partyComp[slot] || ""}
                  onChange={(e) => {
                    if (e.target.value !== partyComp[slot]) {
                      const subRole = JOBS[e.target.value]?.role; // Need to consider melee/phys/magic for role abilities
                      if (!onClearRow(slot, true, subRole)) {
                        return; // If the user cancels clearing the row, don't change the job selection
                      }
                    }
                    setPartyComp({
                      ...partyComp,
                      [slot]: e.target.value || null,
                    });
                  }}
                  className="w-full px-3 py-2 bg-gray-700 rounded"
                >
                  <option value="">None</option>
                  {Object.entries(jobCategories).map(([categoryName, jobs]) => (
                    <optgroup key={categoryName} label={categoryName}>
                      {jobs.map(([id, job]) => (
                        <option key={id} value={id}>
                          {job.name}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
