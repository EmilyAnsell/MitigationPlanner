import { RotateCcw } from "lucide-react";
import { PARTY_SLOTS, SLOT_LABELS, JOBS } from "../../data/jobs";
import { ROW_HEIGHT } from "../../data/bossTimelines";

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
