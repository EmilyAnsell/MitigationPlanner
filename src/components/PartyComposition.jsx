import { useState, useMemo } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { JOBS, PARTY_SLOTS, SLOT_LABELS } from "../data/jobs";

export default function PartyComposition({
  partyComp,
  setPartyComp,
  onClearRow,
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  const getSlotRole = (slot) => {
    if (slot.startsWith("tank")) return "Tank";
    if (slot.startsWith("healer")) return "Healer";
    if (slot.startsWith("dps")) return "DPS";
    return null;
  };

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
                      onClearRow(slot);
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
