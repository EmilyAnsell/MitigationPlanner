import { useEffect, useRef } from "react";
import DialogHeader from "./DialogHeader";
import DialogBody from "./DialogBody";
import DialogFooter from "./DialogFooter";

// Standard focusable-element selector, scoped to what the dialog subtree can contain.
const FOCUSABLE_SELECTOR =
  'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Resolves which focusable element index should receive focus next.
 * @param {number} currentIndex - index of the currently focused element
 * @param {string} direction - "next" or "previous"
 * @param {number} length - total number of focusable elements
 * @returns {number} - index of the element to focus next
 */
function getAdjacentFocusableIndex(currentIndex, direction, length) {
  if (direction === "next") {
    return currentIndex === length - 1 ? 0 : currentIndex + 1;
  } else {
    return currentIndex === 0 ? length - 1 : currentIndex - 1;
  }
}

export default function Dialog({
  isDialogOpen = false,
  onCloseDialog,
  headerContent,
  bodyContent,
  footerContent,
  buttons = [{ label: "Close", onClick: onCloseDialog, variant: "primary" }], // Default close button
}) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!isDialogOpen) return;

    const focusableElements = Array.from(
      dialogRef.current.querySelectorAll(FOCUSABLE_SELECTOR),
    );
    focusableElements[0]?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") {
        onCloseDialog();
        return;
      }

      const isArrowKey = e.key === "ArrowLeft" || e.key === "ArrowRight";
      if (isArrowKey || e.key === "Tab") {
        const currentIndex = focusableElements.indexOf(document.activeElement);
        if (currentIndex === -1) return;
        e.preventDefault();
        const direction =
          e.key === "ArrowLeft" || (e.key === "Tab" && e.shiftKey)
            ? "previous"
            : "next";
        const nextIndex = getAdjacentFocusableIndex(
          currentIndex,
          direction,
          focusableElements.length,
        );
        focusableElements[nextIndex].focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isDialogOpen, onCloseDialog]);

  return isDialogOpen ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCloseDialog}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
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
