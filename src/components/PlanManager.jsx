import { useImperativeHandle, useRef, useState } from "react";
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
  const fileInputRef = useRef(null);

  const plansForBoss = getPlansByBoss(currentTimeline);
  const currentPlan = plansForBoss.find((p) => p.planId === currentPlanId);

  const handleSave = () => {
    if (!currentPlanId) {
      // No plan selected, prompt for name
      openSaveAsDialog();
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

  const openSaveAsDialog = () => {
    const nameRef = { current: "" };
    const errorHandleRef = { current: null };

    const submitSaveAs = () => {
      const trimmedName = nameRef.current.trim();
      if (!trimmedName) {
        errorHandleRef.current?.showError();
        return;
      }

      const newPlanId = generatePlanId(currentTimeline, trimmedName);
      savePlan(newPlanId, {
        bossId: currentTimeline,
        planName: trimmedName,
        partyComp,
        placements,
      });

      onPlanChange(newPlanId);
      openDialog({ body: "Plan saved as new!" });
    };

    openDialog({
      header: "Save Plan As",
      body: (
        <SaveAsBody
          ref={errorHandleRef}
          onNameChange={(value) => {
            nameRef.current = value;
          }}
          onSubmit={submitSaveAs}
        />
      ),
      buttons: [
        { label: "Cancel", onClick: closeDialog, variant: "secondary" },
        { label: "Save", onClick: submitSaveAs },
      ],
    });
  };

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
        onClick={openSaveAsDialog}
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

/**
 * A body component for the Save As dialog. Exposes a showError() method via
 * ref so submitSaveAs (owned by the sibling Save button in DialogFooter) can
 * trigger this component's own "needs a name" state.
 * @param {Object} ref - imperative handle exposing showError()
 * @param {Function} onNameChange - called with the input's current value on each keystroke
 * @param {Function} onSubmit - called when Enter is pressed inside the input
 */
function SaveAsBody({ ref, onNameChange, onSubmit }) {
  const [needsName, setNeedsName] = useState(false);

  useImperativeHandle(
    ref,
    () => ({
      showError: () => setNeedsName(true),
    }),
    [],
  );

  return (
    <>
      <input
        type="text"
        defaultValue=""
        onChange={(e) => onNameChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onSubmit();
        }}
        placeholder="Enter plan name..."
        className="w-full px-3 py-2 bg-gray-700 rounded"
      />
      {needsName && (
        <div className="text-red-500">*Please enter a plan name.</div>
      )}
    </>
  );
}
