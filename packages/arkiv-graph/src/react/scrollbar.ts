import { ARKIV_THEME, type ArkivGraphTheme } from "./theme.js";

let injected = false;

/**
 * Inject (once) a branded scrollbar style and return the class name to apply to
 * scroll containers. In the showcase the app's global CSS already styles
 * scrollbars; this makes standalone library consumers get the brand look too,
 * scoped to a class so it never overrides the host app's scrollbars.
 */
export function ensureScrollbarStyle(theme: ArkivGraphTheme = ARKIV_THEME): string {
  const cls = "arkiv-scrollbar";
  if (injected || typeof document === "undefined") return cls;
  injected = true;
  const track = theme.background;
  const thumb = theme.accent;
  const style = document.createElement("style");
  style.setAttribute("data-arkiv-graph", "scrollbar");
  style.textContent = [
    `.${cls}{scrollbar-width:thin;scrollbar-color:${thumb} ${track}}`,
    `.${cls}::-webkit-scrollbar{width:10px;height:10px}`,
    `.${cls}::-webkit-scrollbar-track{background:${track};border-radius:8px}`,
    `.${cls}::-webkit-scrollbar-thumb{background:${thumb};border-radius:8px;border:2px solid ${track}}`,
    `.${cls}::-webkit-scrollbar-thumb:hover{filter:brightness(1.15)}`,
    `.${cls}::-webkit-scrollbar-corner{background:${track}}`,
  ].join("");
  document.head.appendChild(style);
  return cls;
}
