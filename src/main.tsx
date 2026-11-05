import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Agentation } from "agentation";
import { ThemeProvider } from "next-themes";
import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LandingPage } from "./pages/landing-page";
import { TrendMapPage } from "./pages/trend-map";
import "./styles.css";

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
    <LandingPage onOpenApp={navigateToApp} />
  );
}

const container = document.getElementById("root");
if (!container) throw new Error("Root element is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <App />
      </ThemeProvider>
      {import.meta.env.DEV && <Agentation />}
    </QueryClientProvider>
  </StrictMode>,
);
