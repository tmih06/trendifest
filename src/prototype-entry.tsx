import { useEffect, useState } from "react";
import App from "./App";
import { TrendNetworkPrototype } from "./pages/trend-network-prototype";

/** Keep the old Google workspace reachable while this branch opens the mock by default. */
export default function PrototypeEntry() {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const update = () => setHash(window.location.hash);
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);
  return !hash || hash.startsWith("#/prototype/trend-network") ? (
    <TrendNetworkPrototype />
  ) : (
    <App />
  );
}
