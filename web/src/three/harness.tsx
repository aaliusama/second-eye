import "@fontsource-variable/archivo";
import { lazy, StrictMode, Suspense, useState } from "react";
import { createRoot } from "react-dom/client";
import { fixtureFinding, fixtureScene } from "@site/contracts/fixtures";
import { applyTokens, color, font } from "../tokens";

// Owner: H. Dev-only harness for ModelView3D: http://localhost:<port>/src/three/harness.html
// Not part of the app build (vite builds index.html only). Mounts the view the way D should: lazily.

const ModelView3D = lazy(() => import("./ModelView3D").then((m) => ({ default: m.ModelView3D })));

applyTokens(document.documentElement);

function Harness() {
  const [reveal, setReveal] = useState<string | undefined>(undefined);
  const [selected, setSelected] = useState<string | undefined>(undefined);
  const [unavailable, setUnavailable] = useState(false);

  return (
    <div style={{ height: "100vh", display: "grid", gridTemplateRows: "auto 1fr", background: color.paper, color: color.ink, fontFamily: font.family }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", padding: "10px 16px", borderBottom: `1px solid ${color.inkSoft}`, fontSize: 13 }}>
        <button
          data-testid="reveal"
          onClick={() => {
            setReveal(undefined);
            requestAnimationFrame(() => setReveal(`${fixtureFinding.id}:${fixtureFinding.trigger}`));
          }}
        >
          Play ghost reveal
        </button>
        <span>Selected: {selected ?? "none"}</span>
        <span style={{ marginLeft: "auto", color: color.inkSoft }}>Simulated site data</span>
      </div>
      <div style={{ position: "relative", minHeight: 0 }}>
        {unavailable ? (
          <p style={{ padding: 20 }}>3D not available on this machine; the flat view is shown instead.</p>
        ) : (
          <Suspense fallback={null}>
            <ModelView3D
              scene={fixtureScene}
              findings={[fixtureFinding]}
              selectedId={selected}
              onSelect={(id) => setSelected(id)}
              revealFindingKey={reveal}
              onUnavailable={() => setUnavailable(true)}
            />
          </Suspense>
        )}
      </div>
    </div>
  );
}

// ?strict=0 renders without StrictMode, to tell StrictMode effects from real bugs.
const strict = new URLSearchParams(location.search).get("strict") !== "0";
createRoot(document.getElementById("root")!).render(
  strict ? (
    <StrictMode>
      <Harness />
    </StrictMode>
  ) : (
    <Harness />
  ),
);
