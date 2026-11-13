import { useEffect, useState } from "react";
import type { StateResponse } from "@site/contracts";
import { FlatView } from "./FlatView";

// Owner: D. Scaffold only: proves web -> /api -> server -> contracts works end to end.

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "ok"; state: StateResponse };

export function App() {
  const [load, setLoad] = useState<Load>({ status: "loading" });

  useEffect(() => {
    fetch("/api/state")
      .then(async (res) => {
        if (!res.ok) throw new Error(`server answered ${res.status}`);
        setLoad({ status: "ok", state: (await res.json()) as StateResponse });
      })
      .catch((err: unknown) =>
        setLoad({ status: "error", message: `Server not reachable (${String(err)}). Start it with npm run demo.` }),
      );
  }, []);

  return (
    <div className="app">
      <header>
        <h1>Site Rehearsal</h1>
        <span className="label">Simulated site data</span>
      </header>
      <main className="model">
        {load.status === "loading" && <p>Loading the site record</p>}
        {load.status === "error" && <p>{load.message}</p>}
        {load.status === "ok" && <FlatView scene={load.state.scene} findings={load.state.findings} />}
      </main>
      <aside className="queue">
        <h2>Needs approval</h2>
        {load.status === "ok" && load.state.fixes.length === 0 && <p className="label">Nothing waiting</p>}
      </aside>
    </div>
  );
}
