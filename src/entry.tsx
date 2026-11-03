import { useEffect, useState } from "react";
import App from "./App";
import { TrendGraphPage } from "./pages/trend-graph";
import { TrendMapPage } from "./pages/trend-map";

/**
 * The related graph is the root experience. The classic workspace remains at
 * `#/overview` and is reachable from both shells.
 */
export default function Entry() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  if (hash.startsWith("#/map")) return <TrendMapPage />;
  const graph = !hash || hash.startsWith("#/graph");
  return graph ? <TrendGraphPage /> : <App />;
}
