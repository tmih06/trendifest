import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { TrendMapPage } from "./pages/trend-map";
import "./styles.css";

/** The marketing page must not add its module graph to direct workspace loads. */
const LandingPage = lazy(() =>
  import("./pages/landing-page").then((module) => ({ default: module.LandingPage })),
);

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

function resolveRoute(): "app" | "landing" {
  if (typeof window === "undefined") return "landing";
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const search = new URLSearchParams(window.location.search);
  if (
    path.startsWith("/app") ||
    path.startsWith("/map") ||
    hash === "#app" ||
    search.get("view") === "app"
  ) {
    return "app";
  }
  return "landing";
}

function App() {
  const [route, setRoute] = useState<"app" | "landing">(resolveRoute);

  useEffect(() => {
    const handlePopState = () => {
      setRoute(resolveRoute());
    };
    window.addEventListener("popstate", handlePopState);
    window.addEventListener("hashchange", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
      window.removeEventListener("hashchange", handlePopState);
    };
  }, []);

  const navigateToApp = () => {
    window.history.pushState(null, "", "/app");
    setRoute("app");
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  const navigateToLanding = () => {
    window.history.pushState(null, "", "/");
    setRoute("landing");
    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  };

  return route === "app" ? (
    <TrendMapPage onNavigateHome={navigateToLanding} />
  ) : (
    <Suspense fallback={<p role="status">Loading Trendifest…</p>}>
      <LandingPage onOpenApp={navigateToApp} />
    </Suspense>
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root element is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ThemeProvider
        attribute="class"
        defaultTheme="light"
        enableSystem={false}
        storageKey="trendifest-theme"
      >
        <App />
      </ThemeProvider>
      {import.meta.env.DEV && <DevelopmentToolbar />}
    </QueryClientProvider>
  </StrictMode>,
);
