// @trendifest/opendesk
//
// A lean UI library extracted from the OpenDesk web app (Apache-2.0). See
// ../NOTICE for the upstream commit and the files it was derived from.
// Import the design tokens with: import "@trendifest/opendesk/styles.css";
//
// Dialog lives on its own subpath (`@trendifest/opendesk/dialog`) so the Radix
// dialog runtime is only fetched when a dialog first opens.

export { Badge, type BadgeTone } from "./components/badge.tsx";
export { Button, type ButtonProps } from "./components/button.tsx";
export { Shell } from "./components/shell.tsx";
export { Sidebar, SidebarItem, SidebarSection } from "./components/sidebar.tsx";
export { cn } from "./lib/cn.ts";
