# 3D model view (web/src/three)

Owner: H. A second renderer of the same scene (web/AGENTS.md). The flat SVG view stays the default and the fallback.

## Props

```ts
<ModelView3D
  scene={scene}                       // Scene from @site/contracts
  findings={findings}                 // Finding[]; every finding with a ghost is drawn
  selectedId={selectedElementId}      // optional: element outlined as selected
  onSelect={(elementId, findingKey) => …}  // element click; findingKey set when a ghost was clicked
  revealFindingKey={key}              // `${finding.id}:${finding.trigger}` (or a bare id); each change plays the ghost reveal once
  onUnavailable={() => setView("flat")}    // WebGL missing, crashed or context lost: the view renders nothing
/>
```

- `findingKey(f)` is exported to build the key, because live and rehearsal findings can share an id.
- A finding without a ghost can still be revealed: the camera frames its elements and nothing animates.
- Replaying the same reveal: set the key to `undefined` for one frame, then set it again.

## Mount it lazily (keeps three.js out of the first bundle)

```tsx
const ModelView3D = lazy(() => import("./three/ModelView3D").then((m) => ({ default: m.ModelView3D })));

<div style={{ position: "relative", width: "100%", height: "100%" }}>
  <Suspense fallback={<FlatView … />}>
    <ModelView3D … />
  </Suspense>
</div>
```

The parent must give it a size. It fills 100% width and height.

## What it draws

- Walls are cut at 1.2 m (cut-away model). Rooms and zones are thin slabs with their name in condensed Archivo. Doors and fixtures are small markers.
- State conventions as in web/AGENTS.md: planned is a thin soft outline on a faint fill; proposed is a dashed pending outline; approved is a solid ink outline; built is an ink fill; unconfirmed is pending; conflict is a redline outline.
- Ghost: a translucent redline volume with dashed edges where the crew thinks the element is, plus a dimension line to the true element with `ghost.label`.
- Reveal: the camera frames the element (about 600 ms), the true element is outlined in ink (220 ms), the ghost grows from the true position to the wrong one (500 ms, ease-out), the label appears (160 ms), then everything holds still. Timing comes from the clock, not the frame count. With reduced motion it jumps to the end state.
- One soft key light, gentle contact shadows, a drafting grid with lettered and numbered gridline bubbles every 5 m, and one opening camera move at load.
- `frameloop="demand"`: an idle scene costs nothing. Shared geometry and materials are in `materials.ts`, and the mapping from element to mesh is `elementToMesh.ts`.

## Dev harness

`npx vite --port 5175` from `web/`, then open http://localhost:5175/src/three/harness.html (`?strict=0` disables StrictMode). It renders the contracts fixture scene and the ghost-wall finding, with a "Play ghost reveal" button. It is not part of `vite build`.
