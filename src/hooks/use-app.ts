import { useCallback, useEffect, useRef, useState } from "react";

export type RoutePage = "overview" | "signals" | "explore" | "watchlist" | "alerts";

const PAGES: RoutePage[] = ["overview", "signals", "explore", "watchlist", "alerts"];

interface RouteState {
  page: RoutePage;
  params: URLSearchParams;
}

function parseHash(): RouteState {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const [pagePart = "", query = ""] = raw.split("?");
  const page = PAGES.includes(pagePart as RoutePage) ? (pagePart as RoutePage) : "overview";
  return { page, params: new URLSearchParams(query) };
}

/**
 * Hash routing keeps the app deployable as static files under any host.
 * Query parameters travel in the hash, so a shared link carries its search but
 * never hits the server.
 */
export function useHashRoute() {
  const [route, setRoute] = useState<RouteState>(parseHash);

  useEffect(() => {
    const onChange = () => setRoute(parseHash());
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const navigate = useCallback((page: RoutePage, params?: Record<string, string>) => {
    const query = new URLSearchParams(params ?? {});
    const suffix = query.size ? `?${query.toString()}` : "";
    const next = `#/${page}${suffix}`;
    if (window.location.hash === next) {
      setRoute({ page, params: query });
    } else {
      window.location.hash = next;
    }
  }, []);

  /** Replace the current entry when only view filters change, so Back stays useful. */
  const replace = useCallback((page: RoutePage, params?: Record<string, string>) => {
    const query = new URLSearchParams(params ?? {});
    const suffix = query.size ? `?${query.toString()}` : "";
    const next = `#/${page}${suffix}`;
    if (window.location.hash !== next) {
      window.history.replaceState(null, "", next);
    }
    setRoute({ page, params: query });
  }, []);

  return { ...route, navigate, replace };
}

/** Delay a rapidly changing value; used to keep autocomplete requests quiet. */
export function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export type Theme = "light" | "dark";

function initialTheme(): Theme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * Theme follows an explicit stored choice, otherwise the OS. The swap disables
 * transitions for one frame; without that, every color transition fires and the
 * page smears between appearances.
 */
export function useTheme() {
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const initialized = useRef(false);

  useEffect(() => {
    const root = document.documentElement;
    if (initialized.current) {
      root.classList.add("theme-switching");
      root.classList.toggle("dark", theme === "dark");
      void root.offsetHeight;
      window.requestAnimationFrame(() => root.classList.remove("theme-switching"));
    }
    initialized.current = true;
    document
      .getElementById("theme-color")
      ?.setAttribute("content", theme === "dark" ? "#1e1e1e" : "#ffffff");
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem("trendifest-theme")) return;
      } catch {
        // If storage is blocked, continue following the OS.
      }
      setTheme(event.matches ? "dark" : "light");
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const toggle = useCallback(() => {
    setTheme((current) => {
      const next = current === "dark" ? "light" : "dark";
      try {
        localStorage.setItem("trendifest-theme", next);
      } catch {
        // A blocked storage API should not break the toggle for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
