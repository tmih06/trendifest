import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Agentation } from "agentation";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
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

const container = document.getElementById("root");
if (!container) throw new Error("Root element is missing from index.html");

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={client}>
      <TrendMapPage />
      {import.meta.env.DEV && <Agentation />}
    </QueryClientProvider>
  </StrictMode>,
);
