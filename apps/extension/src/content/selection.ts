export function getSelectedText() {
  return typeof window === "undefined" ? "" : window.getSelection()?.toString() ?? "";
}
