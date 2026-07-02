import { RotateCcw } from "lucide-react";
import { PARTY_SLOTS, SLOT_LABELS, JOBS } from "../../data/jobs";
import { ROW_HEIGHT } from "../../data/bossTimelines";

/**
 * Frozen left-hand column of the timeline listing each filled party slot with
 * its slot label, job name, and a button to clear that row's placements.
 * Rendered as an absolutely positioned overlay so the labels stay in place
 * while the timeline pans horizontally.
 * @param {Object} props
 * @param {Object} props.partyComp - Map of party slot key to selected job ID (or null); slots with no job are omitted
 * @param {number} props.labelWidth - Width of the frozen label column in pixels
 * @param {(slot: string) => boolean} props.onClearRow - Clears all placements from the given slot
 * @returns {JSX.Element}
 */
export default function PartyList({ partyComp, labelWidth, onClearRow }) {
  return (
    <div
      className="absolute top-0 left-0 bg-gray-800 pointer-events-none"
      style={{ width: `${labelWidth}px` }}
    >
      <div style={{ height: "60px", marginBottom: "8px" }} />

      {PARTY_SLOTS.filter((slot) => partyComp[slot] !== null).map((slot) => {
        const jobId = partyComp[slot];
        const job = jobId ? JOBS[jobId] : null;

        return (
          <div
            key={slot}
            className="flex items-center justify-between px-2 py-1 mb-1 text-sm font-semibold bg-gray-800 pointer-events-auto frozen-label"
            style={{
              width: "120px",
              height: `${ROW_HEIGHT}px`,
            }}
          >
            <div className="flex flex-col justify-center min-w-0">
              <div className="truncate">{SLOT_LABELS[slot]}</div>
              {job && (
                <div className="text-xs truncate opacity-75">{job.name}</div>
              )}
            </div>
            <button
              onClick={() => onClearRow(slot)}
              className="p-1 text-gray-400 rounded shrink-0 hover:text-white hover:bg-red-700"
              title={`Clear ${job?.name ?? slot} row`}
            >
              <RotateCcw size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
