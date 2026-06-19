import { PARTY_SLOTS, SLOT_LABELS, JOBS } from "../../data/jobs";
import { ROW_HEIGHT } from "../../data/bossTimelines";

export default function PartyList({
  partyComp,
  labelWidth,
  prepullVisible,
  onTogglePrepull,
}) {
  return (
    <div
      className="absolute top-0 left-0 bg-gray-800 pointer-events-auto"
      style={{ width: `${labelWidth}px` }}
    >
      <div
        className="flex items-center justify-center pointer-events-auto"
        style={{ height: "60px", marginBottom: "8px" }}
      >
        <button
          onClick={onTogglePrepull}
          className={`px-2 py-1 text-xs font-semibold rounded w-full mx-2 ${
            prepullVisible
              ? "bg-blue-600 hover:bg-blue-700 text-white"
              : "bg-gray-600 hover:bg-gray-500 text-gray-200"
          }`}
        >
          Pre-pull Timer:
        </button>
      </div>

      {PARTY_SLOTS.filter((slot) => partyComp[slot] !== null).map((slot) => {
        const jobId = partyComp[slot];
        const job = jobId ? JOBS[jobId] : null;

        return (
          <div
            key={slot}
            className="flex flex-col justify-center px-2 py-1 mb-1 text-sm font-semibold bg-gray-800 pointer-events-auto frozen-label"
            style={{
              width: "120px",
              height: `${ROW_HEIGHT}px`,
            }}
          >
            <div>{SLOT_LABELS[slot]}</div>
            {job && <div className="text-xs opacity-75">{job.name}</div>}
          </div>
        );
      })}
    </div>
  );
}
