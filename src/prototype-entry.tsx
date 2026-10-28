import { useEffect, useState } from "react";
import App from "./App";
import { TrendGraphPrototype } from "./pages/trend-graph";

/** Root opens the graph study; the classic Google Trends workspace stays at #/overview. */
export default function PrototypeEntry() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return !hash || hash.startsWith("#/prototype/trend-graph") ? <TrendGraphPrototype /> : <App />;
}
