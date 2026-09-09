import { ARKIV_THEME } from "arkiv-graph/react";

export const DASHBOARD_THEMES = {
  dark: { ...ARKIV_THEME, surface: "#1f1f1f", colorScheme: "dark" as const },
  light: {
    ...ARKIV_THEME,
    background: "#f6f4ef", surface: "#e9e6de", text: "#111111", muted: "#5f5d58",
    colorScheme: "light" as const, accent: "#181ea9", onAccent: "#ffffff", danger: "#b42332",
    success: "#166534", warning: "#854d0e",
    entityColors: { user: "#181ea9", profile: "#181ea9", post: "#0369a1", comment: "#6d28d9", tip: "#c2541c", message: "#0369a1", note: "#0369a1", session: "#047857" },
    palette: ["#181ea9", "#0369a1", "#c2541c", "#6d28d9", "#047857", "#854d0e"],
    relPalette: ["#181ea9", "#0369a1", "#6d28d9", "#166534", "#854d0e", "#5f5d58"],
    walletColor: "#854d0e", tagColor: "#5f5d58", unresolvedColor: "#73716c",
    edgeColors: { reference: "#73716c", join: "#047857", shared: "#6d28d9", tag: "#73716c", owner: "#854d0e", external: "#5f5d58" },
  },
};
