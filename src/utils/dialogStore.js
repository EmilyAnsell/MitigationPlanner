let state = {
  isOpen: false,
  header: undefined,
  body: undefined,
  footer: undefined,
  buttons: undefined,
};

const listeners = new Set();

function emitChange() {
  listeners.forEach((listener) => listener());
}

/**
 * Subscribes a listener to dialog state changes. Passed to useSyncExternalStore in GlobalDialog.jsx.
 * @param {Function} listener - Callback invoked whenever the dialog state changes
 * @returns {Function} - Unsubscribe function
 */
export function subscribeToDialog(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Returns the current dialog state snapshot. Passed to useSyncExternalStore in GlobalDialog.jsx.
 * Must return the same object reference when nothing has changed — state is reassigned,
 * never mutated, so reference equality reflects real changes.
 * @returns {Object} - Current dialog state (isOpen, header, body, footer, buttons)
 */
export function getDialogSnapshot() {
  return state;
}

/**
 * Opens the shared dialog with the given content. Import and call directly from anywhere —
 * event handlers, utility functions — no props or dialog state need to be threaded through
 * intermediate components.
 * @param {string} [header] - Header content
 * @param {string} [body] - Body content
 * @param {string} [footer] - Extra footer content, rendered before the buttons
 * @param {Array} [buttons] - Buttons as {label, onClick}. When omitted, the store passes `undefined` through and Dialog.jsx supplies its own default "Close" button — the store does NOT default this (single source of truth, see §2).
 */
export function openDialog({ header, body, footer, buttons } = {}) {
  state = {
    isOpen: true,
    header,
    body,
    footer,
    buttons,
  };
  emitChange();
}

/**
 * Closes the shared dialog. Content fields are preserved until the next openDialog call.
 */
export function closeDialog() {
  state = { ...state, isOpen: false };
  emitChange();
}
