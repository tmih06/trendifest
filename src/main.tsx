import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TrendMapPage } from "./pages/trend-map";
import "./styles.css";

/**
 * Defer the optional multi-megabyte debug toolbar until document load so graph
 * modules get the connection first. Keep its real trigger and shortcut; the
 * production guard eliminates the dynamic import and its chunk entirely.
 */
const Agentation = import.meta.env.DEV
  ? lazy(() => import("agentation").then((module) => ({ default: module.Agentation })))
  : null;

/** Mounts the toolbar only after the initial page load has finished. */
function DevelopmentToolbar() {
  const [loaded, setLoaded] = useState(() => document.readyState === "complete");

  useEffect(() => {
    // React can attach this effect after `load` already fired (warm cache, HMR
    // update), so re-reading readyState avoids waiting for a second event.
    if (document.readyState === "complete") {
      setLoaded(true);
      return;
    }
    const finish = () => setLoaded(true);
    window.addEventListener("load", finish, { once: true });
    return () => window.removeEventListener("load", finish);
  }, []);

  if (!Agentation || !loaded) return null;
  return (
    <Suspense fallback={null}>
      <Agentation />
    </Suspense>
  );
}

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
});

const container = document.getElementById("root");
if (!container) throw new Error("Root element is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <TrendMapPage />
      {import.meta.env.DEV && <DevelopmentToolbar />}
    </QueryClientProvider>
  </StrictMode>,
);
