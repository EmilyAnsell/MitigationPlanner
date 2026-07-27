import { useState, useRef } from "react";
import { Save, Download, Upload, Trash2, Plus } from "lucide-react";
import {
  getPlansByBoss,
  savePlan,
  deletePlan,
  generatePlanId,
  exportPlan,
  importPlan,
} from "../utils/planStorage";
import { closeDialog, openDialog } from "../utils/dialogStore";

export default function PlanManager({
  currentTimeline,
  currentPlanId,
  onPlanChange,
  partyComp,
  placements,
}) {
  const [showSaveAsDialog, setShowSaveAsDialog] = useState(false);
  const [newPlanName, setNewPlanName] = useState("");
  const fileInputRef = useRef(null);

  const plansForBoss = getPlansByBoss(currentTimeline);
  const currentPlan = plansForBoss.find((p) => p.planId === currentPlanId);

  const handleSave = () => {
    if (!currentPlanId) {
      // No plan selected, prompt for name
      setShowSaveAsDialog(true);
      return;
    }

    savePlan(currentPlanId, {
      bossId: currentTimeline,
      planName: currentPlan?.planName || "Untitled Plan",
      partyComp,
      placements,
    });

    openDialog({ body: "Plan saved!" });
  };

  const handleSaveAs = () => {
    if (!newPlanName.trim()) {
      openDialog({ body: "Please enter a plan name" });
      return;
    }

    const newPlanId = generatePlanId(currentTimeline, newPlanName);
    savePlan(newPlanId, {
      bossId: currentTimeline,
      planName: newPlanName,
      partyComp,
      placements,
    });

    setShowSaveAsDialog(false);
    setNewPlanName("");
    onPlanChange(newPlanId);
    openDialog({ body: "Plan saved as new!" });
  };

  const handleDelete = () => {
    if (!currentPlanId) return;

    openDialog({
      body: `Delete plan "${currentPlan?.planName}"?`,
      buttons: [
        { label: "Cancel", onClick: closeDialog },
        {
          label: "Delete",
          onClick: () => {
            closeDialog();
            deletePlan(currentPlanId);
            onPlanChange(null);
            openDialog({ body: "Plan deleted" });
          },
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
    fileInputRef.current?.click();
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
        onClick={handleSave}
        className="flex items-center gap-1 px-3 py-2 bg-blue-600 rounded hover:bg-blue-700"
        title="Save"
      >
        <Save size={16} />
        Save
      </button>

      <button
        onClick={() => setShowSaveAsDialog(true)}
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

      {/* Save dialog
      - includes hacky temporary fix to set z-40 so that the "Please enter a plan name" dialog appears on top.
      TODO: refactor this saveAsDialog into a Dialog via openDialog(), updating the dialog with a red-text warning
      when an empty string is submitted rather than another layer of pop-ups*/}
      {showSaveAsDialog && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md p-6 bg-gray-800 rounded-lg">
            <h3 className="mb-4 text-xl font-semibold">Save Plan As</h3>
            <input
              type="text"
              value={newPlanName}
              onChange={(e) => setNewPlanName(e.target.value)}
              placeholder="Enter plan name..."
              className="w-full px-3 py-2 mb-4 bg-gray-700 rounded"
              autoFocus
              onKeyPress={(e) => {
                if (e.key === "Enter") handleSaveAs();
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowSaveAsDialog(false);
                  setNewPlanName("");
                }}
                className="px-4 py-2 bg-gray-600 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAs}
                className="px-4 py-2 bg-blue-600 rounded hover:bg-blue-700"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
