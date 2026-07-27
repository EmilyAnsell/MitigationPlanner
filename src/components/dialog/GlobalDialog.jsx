import { useSyncExternalStore } from "react";
import Dialog from "./Dialog";
import {
  subscribeToDialog,
  getDialogSnapshot,
  closeDialog,
} from "../../utils/dialogStore";

export default function GlobalDialog() {
  const { isOpen, header, body, footer, buttons } = useSyncExternalStore(
    subscribeToDialog,
    getDialogSnapshot,
  );

  return (
    <Dialog
      isDialogOpen={isOpen}
      onCloseDialog={closeDialog}
      headerContent={header}
      bodyContent={body}
      footerContent={footer}
      buttons={buttons}
    />
  );
}
