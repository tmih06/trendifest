import type { UseQueryResult } from "@tanstack/react-query";
import { createContext, useContext } from "react";
import type { Overview, RangeKey } from "../../shared/types.ts";
import type { RoutePage } from "@/hooks/use-app";

export interface AppContextValue {
  geo: string;
  setGeo: (geo: string) => void;
  range: RangeKey;
  setRange: (range: RangeKey) => void;
  live: boolean;
  setLive: (live: boolean) => void;
  overview: UseQueryResult<Overview, Error>;
  params: URLSearchParams;
  navigate: (page: RoutePage, params?: Record<string, string>) => void;
  replace: (page: RoutePage, params?: Record<string, string>) => void;
  openAdd: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export const AppProvider = AppContext.Provider;

export function useApp() {
  const value = useContext(AppContext);
  if (!value) throw new Error("useApp must be used inside the Trendifest provider");
  return value;
}
