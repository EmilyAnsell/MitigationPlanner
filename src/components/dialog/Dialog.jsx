import { DialogHeader } from "./DialogHeader";
import { DialogBody } from "./DialogBody";
import { DialogFooter } from "./DialogFooter";

export default function Dialog({
  isDialogOpen,
  onCloseDialog,
  headerContent,
  bodyContent,
  footerContent,
  buttons = [{ label: "Close", onClick: onCloseDialog }], // Default close button
}) {
  return isDialogOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCloseDialog}
    >
      <div
        className="p-4 bg-gray-800 rounded-lg shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <DialogHeader content={headerContent} />
        <DialogBody content={bodyContent} />
        <DialogFooter content={footerContent} buttonList={buttons} />
      </div>
    </div>
  ) : null;
}
