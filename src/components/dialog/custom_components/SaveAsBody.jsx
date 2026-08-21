import { useImperativeHandle, useState } from "react";

/**
 * A body component for the Save As dialog. Exposes a showError() method via
 * ref so submitSaveAs (owned by the sibling Save button in DialogFooter) can
 * trigger this component's own "needs a name" state.
 * @param {Object} ref - imperative handle exposing showError()
 * @param {Function} onNameChange - called with the input's current value on each keystroke
 * @param {Function} onSubmit - called when Enter is pressed inside the input
 */
export default function SaveAsBody({ ref, onNameChange, onSubmit }) {
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
