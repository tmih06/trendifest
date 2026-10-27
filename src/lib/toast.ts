import { toast } from "sonner";

/**
 * Error toasts stay until dismissed. A message that says how to recover is
 * useless if it disappears before the reader reaches it.
 */
export function toastError(message: string) {
  toast.error(message, { duration: Infinity });
}
