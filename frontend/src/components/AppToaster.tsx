import { Toaster } from "sonner";

export function AppToaster() {
  return (
    <Toaster
      closeButton
      position="bottom-center"
      swipeDirections={["left", "right"]}
      theme="dark"
      toastOptions={{
        closeButtonAriaLabel: "Dismiss notification",
        classNames: {
          toast: "neat-toast",
          title: "neat-toast__title",
          description: "neat-toast__description",
          actionButton: "neat-toast__action",
          closeButton: "neat-toast__close",
          error: "neat-toast--error",
          warning: "neat-toast--warning",
          success: "neat-toast--success",
        },
      }}
    />
  );
}
