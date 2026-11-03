import { useCallback, useEffect, useRef, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "trendifest-theme";

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
    // Matches the OpenDesk chrome surface, not the page surface, so the mobile
    // browser bar blends with the app frame in both themes.
    document
      .getElementById("theme-color")
      ?.setAttribute("content", theme === "dark" ? "#141416" : "#f5f5f5");
  }, [theme]);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (event: MediaQueryListEvent) => {
      try {
        if (localStorage.getItem(STORAGE_KEY)) return;
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
        localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // A blocked storage API should not break the toggle for this session.
      }
      return next;
    });
  }, []);

  return { theme, toggle };
}
