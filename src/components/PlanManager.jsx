import { useRef } from "react";
import { Save, Download, Upload, Trash2, Plus } from "lucide-react";
import {
  getPlansByBoss,
  loadPlan,
  deletePlan,
  generatePlanId,
  savePlan,
  exportPlan,
  importPlan,
  getDraft,
  deleteDraft,
} from "../utils/planStorage";
import { closeDialog, openDialog } from "../utils/dialogStore";
import { confirmDiscardDraft } from "../utils/confirmDiscardDraft";
import { openSaveAsDialog } from "../utils/openSaveAsDialog";

export default function PlanManager({
  currentTimeline,
  currentPlanId,
  onPlanChange,
  onSave,
  partyComp,
  placements,
}) {
  const fileInputRef = useRef(null);

  const plansForBoss = getPlansByBoss(currentTimeline);
  const currentPlan = currentPlanId ? loadPlan(currentPlanId) : null;

  const handleDelete = () => {
    if (!currentPlanId) return;

    openDialog({
      body: `Delete plan "${currentPlan?.planName}"?`,
      buttons: [
        { label: "Cancel", onClick: closeDialog, variant: "secondary" },
        {
          label: "Delete",
          onClick: () => {
            deletePlan(currentPlanId);
            onPlanChange(null);
            openDialog({ body: "Plan deleted" });
          },
          variant: "danger",
        },
      ],
    });
  };

  const handleExport = () => {
    const planData = {
      bossId: currentTimeline,
      planName: currentPlan?.planName || "Untitled Plan",
      partyComp,
      placements,
      exportedAt: new Date().toISOString(),
    };

    exportPlan(planData);
  };

  const handleImport = () => {
    const openPicker = () => fileInputRef.current?.click();
    // Select whatever the save landed on before opening the picker.
    // Avoids landing on a draft the save just deleted, in case the import is cancelled.
    const onSaveThenImport = () =>
      onSave((planId) => {
        onPlanChange(planId);
        openPicker();
      });
    const onDiscard = () => {
      deleteDraft();
      closeDialog();
      // Reset to New Plan immediately, not just on a successful import.
      // The picker's own cancel event isn't a signal worth hanging this on,
      // so Import has no target plan to fall back on once a file is chosen.
      onPlanChange(null);
      openPicker();
    };
    if (getDraft() !== null) {
      confirmDiscardDraft(onSaveThenImport, onDiscard);
    } else {
      openPicker();
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    importPlan(file, (data) => {
      const newPlanId = generatePlanId(
        data.bossId || currentTimeline,
        data.planName || "Imported Plan",
      );
      savePlan(newPlanId, {
        bossId: data.bossId || currentTimeline,
        planName: data.planName || "Imported Plan",
        partyComp: data.partyComp,
        placements: data.placements,
      });

      onPlanChange(newPlanId);
      openDialog({ body: "Plan imported successfully!" });
    });

    // Reset input
    e.target.value = "";
  };

  return (
    <div className="flex items-center gap-2">
      {/* Plan Selector */}
      <select
        value={currentPlanId || ""}
        onChange={(e) => onPlanChange(e.target.value || null)}
        className="px-3 py-2 bg-gray-700 rounded"
      >
        <option value="">New Plan (Unsaved)</option>
        {plansForBoss.map((plan) => (
          <option key={plan.planId} value={plan.planId}>
            {plan.planName}
          </option>
        ))}
      </select>

      {/* Action Buttons */}
      <button
        onClick={() => onSave()}
        className="flex items-center gap-1 px-3 py-2 bg-blue-600 rounded hover:bg-blue-700"
        title="Save"
      >
        <Save size={16} />
        Save
      </button>

      <button
        onClick={() =>
          openSaveAsDialog({
            currentTimeline,
            partyComp,
            placements,
            onSaved: onPlanChange,
          })
        }
        className="flex items-center gap-1 px-3 py-2 bg-blue-600 rounded hover:bg-blue-700"
        title="Save As"
      >
        <Plus size={16} />
        Save As
      </button>

      <button
        onClick={handleExport}
        className="flex items-center gap-1 px-3 py-2 bg-gray-600 rounded hover:bg-gray-700"
        title="Export"
      >
        <Download size={16} />
      </button>

      <button
        onClick={handleImport}
        className="flex items-center gap-1 px-3 py-2 bg-gray-600 rounded hover:bg-gray-700"
        title="Import"
      >
        <Upload size={16} />
      </button>

      {currentPlanId && (
        <button
          onClick={handleDelete}
          className="flex items-center gap-1 px-3 py-2 bg-red-600 rounded hover:bg-red-700"
          title="Delete"
        >
          <Trash2 size={16} />
        </button>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  );
}
