import { clsx, type ClassValue } from "clsx";

/**
 * Join class names. Utilities that fight over the same property are settled by
 * the emitted stylesheet order, which this package's `styles.css` fixes: the
 * component defaults come first and a caller's override uses a later token
 * (for example `text-fg-3` over the ghost button's `text-fg-2`). A class merge
 * library is therefore not needed.
 */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}
