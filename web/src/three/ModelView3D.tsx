import "@fontsource-variable/archivo/wdth.css";
import { CameraControls, ContactShadows, Grid, Html, Line, useCursor } from "@react-three/drei";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Component, createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { Box3, ExtrudeGeometry, Shape, Sphere, Vector2, Vector3, type Group, type Mesh } from "three";
import type { Line2, LineSegments2 } from "three-stdlib";
import type { Crew, Element, Finding, Scene } from "@site/contracts";
import { beliefGeometry, beliefState, crewHue, easeInOut, offsetLabel, sameGeometry } from "../derive";
import { font } from "../tokens";
import { elementToMesh, type MeshProps } from "./elementToMesh";
import { boxEdges, planBounds, planLine, rectSolid, slabOutline, solidBounds, solidFor, elementSolid, wallPieces, type Solid } from "./geometry";
import { ghostItems, itemAt, itemFrame, itemShape, rectEllipse, shortName, type ItemShape, type V } from "../planSymbols";
import { color, edgeByState, fillByState, ghostFill, ghostRevealFill, groundShadow, unitBox, unitCylinder, type EdgeStyle } from "./materials";

// Owner: H. Second renderer of the same scene (web/AGENTS.md): a cut-away architectural model.
// Reads only the scene and findings from contracts. Flat SVG stays the default and the fallback.

export interface ModelView3DProps {
  scene: Scene;
  findings: Finding[];
  /** Element id to outline as selected. */
  selectedId?: string;
  /** Called with an element id when an element or its ghost is clicked; findingKey is set for ghosts. */
  onSelect?: (elementId: string, findingKey?: string) => void;
  /** `${finding.id}:${finding.trigger}` (or a bare finding id). Each change plays the ghost reveal once. */
  revealFindingKey?: string;
  /** WebGL missing or lost: the view renders nothing; show the flat view instead. */
  onUnavailable?: () => void;
  /** "See the floor as": draw the floor as this crew believes it (same derive.ts rule as the flat view). */
  lens?: Crew;
  /** Elements this crew's planned work touches: an unheard change there is drawn in redline. */
  exposedIds?: Set<string>;
  /** Earlier position / Compare / Latest record, the same setting as the flat plan. Ignored under a lens. */
  comparison?: "compare" | "earlier" | "latest";
}

export const findingKey = (f: Finding) => `${f.id}:${f.trigger}`;
const matchesKey = (f: Finding, key: string | undefined) => key !== undefined && (findingKey(f) === key || f.id === key);

// ---------- Timing (web/AGENTS.md motion spec) ----------

const CAMERA_MS = 600;
const OUTLINE_MS = 220;
const GROW_MS = 500;
const LABEL_MS = 160;
const easeOut = (p: number) => 1 - Math.pow(1 - Math.min(Math.max(p, 0), 1), 3);

type Phase = "idle" | "camera" | "play" | "done";
interface RevealState {
  key?: string;
  phase: Phase;
  /** Clock time (s) when the outline step starts. */
  t0: number;
}

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
}

function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

// ---------- Outer shell ----------

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * All drei <Html> labels portal into this layer. Without a fixed target, Html re-mounts when the
 * canvas' event target connects after first render, and the first label is lost (seen in the harness).
 */
const LabelLayer = createContext<RefObject<HTMLDivElement | null> | undefined>(undefined);
const useLabelLayer = () => useContext(LabelLayer) as RefObject<HTMLElement> | undefined;

export function ModelView3D(props: ModelView3DProps) {
  const [available] = useState(hasWebGL);
  const labels = useRef<HTMLDivElement>(null);
  const onUnavailable = props.onUnavailable;
  useEffect(() => {
    if (!available) onUnavailable?.();
  }, [available, onUnavailable]);
  // Leaving 3D on purpose (Flat) unmounts the canvas, and three.js then drops its own WebGL context.
  // That context loss is not a failure: without this, the app took it for "no WebGL" and hid the toggle.
  const closing = useRef(false);
  useLayoutEffect(() => {
    closing.current = false;
    return () => {
      closing.current = true;
    };
  }, []);
  if (!available) return null;

  return (
    <Boundary onError={() => onUnavailable?.()}>
      <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <Canvas
        shadows
        dpr={[1, 2]}
        frameloop="demand"
        camera={{ fov: 30, near: 0.1, far: 600, position: [0, 80, 0.01] }}
        gl={{ antialias: true }}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", () => { if (!closing.current) onUnavailable?.(); }, { once: true });
        }}
        onPointerMissed={() => undefined}
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        <color attach="background" args={[color.paper]} />
        <LabelLayer.Provider value={labels}>
          <Model {...props} />
        </LabelLayer.Provider>
      </Canvas>
      <div ref={labels} style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }} />
      </div>
    </Boundary>
  );
}

// ---------- Scene ----------

interface GhostItem {
  key: string;
  finding: Finding;
  element: Element;
}

// ---------- Lens glide: walls move to the crew's belief (answers a user action) ----------

const LENS_MS = 520;

interface Glide {
  /** Solid of each element under the previous lens, where it differs from the new one. */
  from: Map<string, Solid>;
  /** Clock seconds when the glide started; -1 = start on the next frame. */
  t0: number;
}

/** The element as the crew believes it: geometry and state from what they heard. */
const asBelieved = (el: Element, lens: Crew | undefined): Element =>
  lens ? { ...el, geometry: beliefGeometry(el, lens), state: beliefState(el, lens) } : el;

function Model({ scene, findings, selectedId, onSelect, revealFindingKey, lens, exposedIds, comparison: asked = "compare" }: ModelView3DProps) {
  const comparison = lens ? "compare" : asked;
  // Earlier position: a wall with an open ghost stands on its earlier line (drawn by its ghost, as on the flat plan).
  const earlierLine = useMemo(() => {
    const out = new Map<string, Element["geometry"]>();
    if (comparison === "earlier") for (const f of findings) if (f.ghost && !out.has(f.ghost.elementId)) out.set(f.ghost.elementId, f.ghost.geometry);
    return out;
  }, [findings, comparison]);
  const bounds = useMemo(() => planBounds(scene), [scene]);
  // Root offset snapped to the 5 m structural grid so the floor grid lines up with plan metres.
  const offset = useMemo<[number, number, number]>(() => {
    const cx = Math.round((bounds.minX + bounds.maxX) / 2 / 5) * 5;
    const cy = Math.round((bounds.minY + bounds.maxY) / 2 / 5) * 5;
    return [-cx, 0, cy];
  }, [bounds]);
  // Walls, rooms and windows are single solids (a wall with a door in it: one solid per side of the opening).
  // Doors and fixtures are drawn from their shared shape below, the same one the flat plan draws.
  const meshes = useMemo(
    () =>
      scene.elements
        .filter((el) => el.geometry.kind !== "point" && !earlierLine.has(el.id))
        .flatMap((el) => {
          const believed = asBelieved(el, lens);
          return wallPieces(believed, scene).map((geometry) => elementToMesh({ ...believed, geometry }, scene));
        }),
    [scene, lens, earlierLine],
  );
  const invalidate = useThree((s) => s.invalidate);

  // On a lens change, remember where each wall was drawn so it can glide to the new belief.
  const glide = useRef<Glide>({ from: new Map(), t0: -1 });
  const shown = useRef<{ lens?: string; meshes: MeshProps[] }>({ lens: lens?.id, meshes });
  useLayoutEffect(() => {
    const before = shown.current;
    shown.current = { lens: lens?.id, meshes };
    if (before.lens === lens?.id) return;
    const from = new Map<string, Solid>();
    if (!prefersReducedMotion()) {
      for (const m of before.meshes) {
        const now = meshes.find((x) => x.id === m.id);
        if (now && m.solid.kind === "box" && now.solid.kind === "box" && (m.solid.center[0] !== now.solid.center[0] || m.solid.center[2] !== now.solid.center[2] || m.solid.rotY !== now.solid.rotY)) from.set(m.id, m.solid);
      }
    }
    glide.current = { from, t0: -1 };
    invalidate();
  }, [lens?.id, meshes, invalidate]);

  // Elements whose belief differs from the record for some crew: their recorded outline is mounted once
  // and toggled visible per lens (web/AGENTS.md: toggle, do not mount and unmount).
  const diffs = useMemo(
    () => scene.elements.filter((el) => el.type !== "room" && el.type !== "zone" && scene.crews.some((c) => !sameGeometry(beliefGeometry(el, c), el.geometry))),
    [scene],
  );

  const ghosts = useMemo<GhostItem[]>(() => {
    const seen = new Set<string>();
    const out: GhostItem[] = [];
    const ordered = [...findings].sort((a, b) => Number(matchesKey(b, revealFindingKey)) - Number(matchesKey(a, revealFindingKey)));
    for (const f of ordered) {
      if (!f.ghost) continue;
      const element = scene.elements.find((e) => e.id === f.ghost!.elementId);
      if (!element) continue;
      const dedupe = `${f.ghost.elementId}|${JSON.stringify(f.ghost.geometry)}`;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push({ key: findingKey(f), finding: f, element });
    }
    return out;
  }, [findings, scene, revealFindingKey]);

  // Items a crew would build against an earlier wall line: the same list the flat plan draws (planSymbols.ts).
  const oldLine = useMemo(() => (comparison === "compare" && !lens ? ghostItems(scene, findings.filter((f) => f.ghost)) : []), [scene, findings, lens, comparison]);
  // Every door and fixture, once: against the earlier line in red if a crew would build it there, else where
  // its wall is drawn (the record, or this crew's belief).
  const items = useMemo(() => {
    const out: { el: Element; shape: ItemShape; crewId?: string }[] = [];
    for (const el of scene.elements) {
      if (el.geometry.kind !== "point") continue;
      const old = oldLine.find((i) => i.el.id === el.id);
      const at = old?.at ?? itemAt(el, scene, (w) => earlierLine.get(w.id) ?? beliefGeometry(w, lens)) ?? (el.geometry.at as V);
      const shape = itemShape(el, at, old?.frame ?? itemFrame(el, scene));
      if (shape) out.push({ el: asBelieved(el, lens), shape, crewId: old?.crewId });
    }
    return out;
  }, [scene, lens, oldLine, earlierLine]);
  // The strip between each earlier line and the recorded wall, where a crew's item sits on the earlier line.
  const bands = useMemo(() => {
    const out: { key: string; solid: Solid }[] = [];
    for (const wallId of new Set(oldLine.map((i) => i.wallId))) {
      const wall = scene.elements.find((e) => e.id === wallId);
      const ghost = findings.find((f) => f.ghost?.elementId === wallId)?.ghost;
      if (!wall || wall.geometry.kind !== "segment" || ghost?.geometry.kind !== "segment") continue;
      const [a, b] = [wall.geometry, ghost.geometry];
      const mid = (g: typeof a): V => [(g.from[0] + g.to[0]) / 2, (g.from[1] + g.to[1]) / 2];
      const [ma, mb] = [mid(a), mid(b)];
      const dx = a.to[0] - a.from[0];
      const dy = a.to[1] - a.from[1];
      out.push({
        key: wallId,
        solid: { kind: "box", center: [(ma[0] + mb[0]) / 2, 0.012, -(ma[1] + mb[1]) / 2], size: [Math.hypot(dx, dy), 0.012, Math.hypot(ma[0] - mb[0], ma[1] - mb[1])], rotY: Math.atan2(dy, dx) },
      });
    }
    return out;
  }, [oldLine, scene, findings]);

  const reveal = useRef<RevealState>({ phase: "idle", t0: 0 });
  const revealing = findings.find((f) => matchesKey(f, revealFindingKey));

  const span = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY, 10);

  return (
    <>
      <hemisphereLight args={[color.paper, color.inkSoft, 1.15]} />
      <directionalLight
        position={[span * 0.12, span * 0.85, span * 0.55]}
        intensity={2.1}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={5}
        shadow-camera-left={-span}
        shadow-camera-right={span}
        shadow-camera-top={span}
        shadow-camera-bottom={-span}
        shadow-camera-far={span * 4}
      />
      <CameraControls makeDefault minDistance={3} maxDistance={span * 4} maxPolarAngle={1.32} minPolarAngle={0.02} />
      <CameraRig scene={scene} offset={offset} reveal={reveal} revealing={revealing} />

      <mesh rotation-x={-Math.PI / 2} position-y={0} receiveShadow material={groundShadow}>
        <planeGeometry args={[span * 6, span * 6]} />
      </mesh>
      <Grid
        position-y={0.002}
        args={[10, 10]}
        cellSize={1}
        cellThickness={0.55}
        cellColor={color.inkSoft}
        sectionSize={5}
        sectionThickness={1}
        sectionColor={color.inkSoft}
        fadeDistance={span * 2.4}
        fadeStrength={2.2}
        infiniteGrid
      />
      <ContactShadows position-y={0.004} scale={span * 2.2} resolution={1024} blur={2.6} far={1.4} opacity={0.38} color={color.ink} />

      <group position={offset}>
        <GridBubbles bounds={bounds} />
        {meshes.map((m, i) => (
          <Element3D key={`${m.id}-${i}`} m={m} selected={selectedId === m.id} onSelect={onSelect} glide={glide} />
        ))}
        {diffs.map((el) => (
          <LensDiff3D key={`lens-${el.id}`} element={el} lens={lens} exposed={exposedIds?.has(el.id) ?? false} />
        ))}
        {/* Through a crew's eyes the record's conflicts are not drawn as ghosts (same as the flat view). */}
        {bands.map(({ key, solid }) => solid.kind === "box" && (
          <mesh key={`band-${key}`} geometry={unitBox} material={ghostFill} position={solid.center} rotation-y={solid.rotY} scale={solid.size} renderOrder={1} />
        ))}
        {items.map(({ el, shape, crewId }) => (
          <Item3D
            key={el.id}
            el={el}
            shape={shape}
            selected={selectedId === el.id}
            onSelect={onSelect}
            tag={crewId ? { letter: scene.crews.find((c) => c.id === crewId)?.letter ?? "?", hue: crewHue(scene, crewId), crew: scene.crews.find((c) => c.id === crewId)?.name ?? "" } : undefined}
          />
        ))}
        {ghosts.map((g) => (
          <Ghost3D key={g.key} item={g} active={matchesKey(g.finding, revealFindingKey)} reveal={reveal} onSelect={onSelect} hidden={!!lens || comparison === "latest"} solo={comparison === "earlier"} />
        ))}
      </group>
    </>
  );
}

// ---------- Camera: one opening move, then the reveal framing ----------

const OPEN_AZIMUTH = 0.42;
const OPEN_POLAR = 0.92;

/** fitToBox snaps the polar angle to 0 or 90 degrees; a bounding sphere keeps the three-quarter view. */
function worldSphere(solids: Solid[], offset: [number, number, number], pad: number, scale = 1): Sphere {
  const sphere = worldBox(solids, offset, 0).getBoundingSphere(new Sphere());
  sphere.radius = sphere.radius * scale + pad;
  return sphere;
}

function worldBox(solids: Solid[], offset: [number, number, number], pad: number): Box3 {
  const box = new Box3();
  for (const s of solids) {
    const [a, b, c, d, e, f] = solidBounds(s);
    box.expandByPoint(new Vector3(a + offset[0], b, c + offset[2]));
    box.expandByPoint(new Vector3(d + offset[0], e, f + offset[2]));
  }
  box.expandByVector(new Vector3(pad, 0.2, pad));
  return box;
}

function CameraRig({
  scene,
  offset,
  reveal,
  revealing,
}: {
  scene: Scene;
  offset: [number, number, number];
  reveal: React.RefObject<RevealState>;
  revealing?: Finding;
}) {
  const controls = useThree((s) => s.controls) as unknown as CameraControls | null;
  const clock = useThree((s) => s.clock);
  const invalidate = useThree((s) => s.invalidate);
  const opening = useRef<Promise<unknown> | undefined>(undefined);

  // Opening move: once per mount. Top-down plan, then settle into the three-quarter view.
  useEffect(() => {
    if (!controls || opening.current) return;
    const all = worldSphere(scene.elements.map((el) => elementSolid(el, scene)), offset, 0, 0.62);
    const reduced = prefersReducedMotion();
    controls.smoothTime = 0.5;
    opening.current = (async () => {
      await controls.rotateTo(0, 0.05, false);
      await controls.fitToSphere(all, false);
      if (reduced) {
        await controls.rotateTo(OPEN_AZIMUTH, OPEN_POLAR, false);
        await controls.fitToSphere(all, false);
        return;
      }
      await settle(Promise.all([controls.rotateTo(OPEN_AZIMUTH, OPEN_POLAR, true), controls.fitToSphere(all, true)]), 1800);
    })();
    invalidate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls]);

  // Reveal: frame the element (600 ms), then hand over to the ghost's own timeline.
  const key = revealing ? findingKey(revealing) : undefined;
  useEffect(() => {
    if (!controls || !revealing || !key) return;
    const state = reveal.current!;
    state.key = key;
    state.phase = "camera";
    const reduced = prefersReducedMotion();
    const target = revealing.ghost
      ? scene.elements.find((e) => e.id === revealing.ghost!.elementId)
      : scene.elements.find((e) => revealing.elementIds.includes(e.id) && e.type !== "room" && e.type !== "zone") ??
        scene.elements.find((e) => revealing.elementIds.includes(e.id));
    const solids: Solid[] = [];
    if (target) solids.push(elementSolid(target));
    if (revealing.ghost && target) solids.push(solidFor(revealing.ghost.geometry, target.type, target.height));
    const box = solids.length ? worldSphere(solids, offset, 1.2) : undefined;

    let cancelled = false;
    void (async () => {
      await opening.current;
      if (cancelled) return;
      if (box) {
        controls.smoothTime = 0.18;
        const move = Promise.all([controls.rotateTo(0.55, 0.82, !reduced), controls.fitToSphere(box, !reduced)]);
        if (!reduced) await settle(move, CAMERA_MS + 250);
      }
      if (cancelled || state.key !== key) return;
      state.phase = reduced ? "done" : "play";
      state.t0 = clock.getElapsedTime();
      invalidate();
    })();
    invalidate();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controls, key]);

  return null;
}

/** Wait for a camera transition, but never longer than `ms`: the reveal must not stall on a slow settle. */
function settle(p: Promise<unknown>, ms: number): Promise<unknown> {
  return Promise.race([p, new Promise((r) => setTimeout(r, ms))]);
}

// ---------- Elements ----------

function useSlabGeometry(solid: Solid) {
  const geo = useMemo(() => {
    if (solid.kind !== "slab") return undefined;
    const shape = new Shape(solid.points.map(([x, y]) => new Vector2(x, y)));
    shape.autoClose = true;
    return new ExtrudeGeometry(shape, { depth: solid.height, bevelEnabled: false });
  }, [solid]);
  useEffect(() => () => geo?.dispose(), [geo]);
  return geo;
}

function Element3D({ m, selected, onSelect, glide }: { m: MeshProps; selected: boolean; onSelect?: ModelView3DProps["onSelect"]; glide: RefObject<Glide> }) {
  const [hovered, setHovered] = useState(false);
  const box = useRef<Group>(null);
  // Lens glide: mutate the group, never React state, inside the frame loop (web/AGENTS.md 3D rules).
  useFrame((state) => {
    const g = glide.current;
    const from = g?.from.get(m.id);
    const to = m.solid;
    if (!g || !from || from.kind !== "box" || to.kind !== "box" || !box.current) return;
    const now = state.clock.getElapsedTime();
    if (g.t0 < 0) g.t0 = now;
    const p = easeInOut(((now - g.t0) * 1000) / LENS_MS);
    box.current.position.set(from.center[0] + (to.center[0] - from.center[0]) * p, to.center[1], from.center[2] + (to.center[2] - from.center[2]) * p);
    box.current.rotation.y = from.rotY + (to.rotY - from.rotY) * p;
    if (p < 1) state.invalidate();
  });
  useCursor(hovered);
  const layer = useLabelLayer();
  const slab = useSlabGeometry(m.solid);
  const lit = hovered || selected;
  const edgeColor = lit ? color.ink : m.edge.color;
  const edgeWidth = m.edge.width + (selected ? 1.75 : hovered ? 1 : 0);

  const events = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect?.(m.id);
    },
  };

  if (m.solid.kind === "slab" && slab) {
    const s = m.solid;
    return (
      <group>
        <mesh geometry={slab} material={m.fill} rotation-x={-Math.PI / 2} receiveShadow {...events} />
        <Line
          points={slabOutline(s.points, s.height + 0.002)}
          color={edgeColor}
          lineWidth={edgeWidth}
          dashed={m.edge.dashed}
          dashSize={0.25}
          gapSize={0.15}
        />
        {m.label && (
          <Html portal={layer} position={[s.center[0], s.height + 0.02, s.center[2]]} center zIndexRange={[10, 0]} style={{ pointerEvents: "none" }}>
            <div style={labelStyle(lit)}>{m.label}</div>
          </Html>
        )}
      </group>
    );
  }

  if (m.solid.kind !== "box") return null;
  const s = m.solid;
  return (
    <group ref={box} position={s.center} rotation-y={s.rotY}>
      <mesh geometry={unitBox} material={m.fill} scale={s.size} castShadow={m.castShadow} receiveShadow {...events} />
      <Line points={boxEdges(s.size)} segments color={edgeColor} lineWidth={edgeWidth} dashed={m.edge.dashed} dashSize={0.2} gapSize={0.12} />
    </group>
  );
}

/**
 * A door or a fixture: its shared shape (planSymbols.ts) standing on the floor. Each part is the plan
 * footprint extruded; each plan line lies on the floor or on top of its part. With a crew tag it is where
 * that crew would build it, against an earlier wall line: redline, dashed, translucent.
 */
function Item3D({ el, shape, selected, onSelect, tag }: { el: Element; shape: ItemShape; selected: boolean; onSelect?: ModelView3DProps["onSelect"]; tag?: { letter: string; hue: string; crew: string } }) {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);
  const layer = useLabelLayer();
  const ghost = !!tag;
  const lit = hovered || selected;
  const edge: EdgeStyle = edgeByState[el.state];
  const tone = ghost ? color.redline : lit ? color.ink : edge.color;
  const width = (ghost ? 1.5 : edge.width) + (selected ? 1.75 : hovered ? 1 : 0);
  const dash = ghost ? { dashed: true, dashSize: 0.08, gapSize: 0.05 } : { dashed: edge.dashed, dashSize: 0.2, gapSize: 0.12 };
  const fill = ghost ? ghostFill : fillByState[el.state];
  const events = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect?.(el.id);
    },
  };
  const first = shape.rects[0] ?? undefined;
  const anchor = first ? first.c : shape.lines[0]?.pts[0];
  return (
    <group>
      {shape.rects.map((r, i) => {
        const s = rectSolid(r);
        if (r.round) {
          return (
            <group key={`r${i}`}>
              <mesh geometry={unitCylinder} material={fill} position={s.center} rotation-y={s.rotY} scale={s.size} castShadow={!ghost} renderOrder={ghost ? 2 : 0} {...events} />
              <Line points={planLine(rectEllipse(r), r.y0 + r.h, true)} color={tone} lineWidth={width} {...dash} />
              <Line points={planLine(rectEllipse(r), r.y0 + 0.004, true)} color={tone} lineWidth={width} {...dash} />
            </group>
          );
        }
        return (
          <group key={`r${i}`} position={s.center} rotation-y={s.rotY}>
            <mesh geometry={unitBox} material={fill} scale={s.size} castShadow={!ghost} renderOrder={ghost ? 2 : 0} {...events} />
            <Line points={boxEdges(s.size)} segments color={tone} lineWidth={width} {...dash} />
          </group>
        );
      })}
      {shape.lines.map((ln, i) => (
        <Line key={`l${i}`} points={planLine(ln.pts, ln.y, ln.closed)} color={tone} lineWidth={width} {...dash} />
      ))}
      {tag && anchor && (
        <Html portal={layer} position={[anchor[0], shape.top + 0.12, -anchor[1]]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
          <div title={`${tag.crew} would build this here, against the earlier line`} style={{ display: "flex", alignItems: "center", gap: 4, transform: "translateY(-12px)", whiteSpace: "nowrap", userSelect: "none", fontFamily: font.family, fontStretch: "80%" }}>
            <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 16, height: 16, background: color.paper, border: `1.5px solid ${tag.hue}`, color: color.ink, fontWeight: 700, fontSize: 11, lineHeight: 1 }}>{tag.letter}</span>
            <span style={{ background: color.paper, color: color.redline, fontWeight: 600, fontSize: 11, lineHeight: 1, padding: "2px 3px" }}>{shortName(el.name)}</span>
          </div>
        </Html>
      )}
    </group>
  );
}

function labelStyle(strong: boolean): React.CSSProperties {
  return {
    fontFamily: font.family,
    fontStretch: "75%",
    fontWeight: strong ? 600 : 500,
    fontSize: 12,
    lineHeight: 1,
    letterSpacing: "0.01em",
    color: strong ? color.ink : color.inkSoft,
    whiteSpace: "nowrap",
    userSelect: "none",
  };
}

// ---------- Ghost: where the crew thinks the element is ----------

function Ghost3D({
  item,
  active,
  reveal,
  onSelect,
  hidden = false,
  solo = false,
}: {
  item: GhostItem;
  active: boolean;
  reveal: React.RefObject<RevealState>;
  onSelect?: ModelView3DProps["onSelect"];
  /** Toggled, not unmounted, so the reveal state survives a lens on and off. */
  hidden?: boolean;
  /** Earlier position: the earlier line alone, without the recorded wall's outline or the dimension. */
  solo?: boolean;
}) {
  const { finding, element } = item;
  const ghost = finding.ghost!;
  const trueSolid = useMemo(() => elementSolid(element), [element]);
  const ghostSolid = useMemo(() => solidFor(ghost.geometry, element.type, element.height), [ghost.geometry, element]);

  const group = useRef<Group>(null);
  const fill = useRef<Mesh>(null);
  const edges = useRef<Line2 | LineSegments2>(null);
  const trueOutline = useRef<Line2 | LineSegments2>(null);
  const dimension = useRef<Group>(null);
  const label = useRef<HTMLDivElement>(null);
  const layer = useLabelLayer();
  const [hovered, setHovered] = useState(false);
  useCursor(hovered);

  const from = trueSolid.center;
  const to = ghostSolid.center;
  const size: [number, number, number] = ghostSolid.kind === "box" ? ghostSolid.size : [1, 0.02, 1];
  const rotY = ghostSolid.kind === "box" ? ghostSolid.rotY : 0;
  const trueSize: [number, number, number] = trueSolid.kind === "box" ? trueSolid.size : size;
  const trueRot = trueSolid.kind === "box" ? trueSolid.rotY : 0;
  const top = Math.max(size[1], trueSize[1]) + 0.45;
  const dimPoints = useMemo<[number, number, number][]>(
    () => [
      [to[0], top, to[2]],
      [from[0], top, from[2]],
    ],
    [from, to, top],
  );
  const ticks = useMemo<[number, number, number][]>(
    () => [
      [to[0], top - 0.18, to[2]],
      [to[0], top + 0.18, to[2]],
      [from[0], top - 0.18, from[2]],
      [from[0], top + 0.18, from[2]],
    ],
    [from, to, top],
  );

  // Pose for progress values. Pure numbers in, object mutation out: no allocation per frame.
  const pose = (outline: number, grow: number, labelIn: number, isReveal: boolean) => {
    const g = group.current;
    if (g) g.position.set(from[0] + (to[0] - from[0]) * grow, to[1], from[2] + (to[2] - from[2]) * grow);
    if (fill.current) fill.current.material = isReveal ? ghostRevealFill : ghostFill;
    if (isReveal) ghostRevealFill.opacity = 0.24 * Math.max(grow, 0.15 * Math.min(outline, 1));
    if (edges.current) {
      edges.current.material.opacity = isReveal ? Math.max(grow, 0.0001) : 1;
      edges.current.visible = !isReveal || outline >= 1;
    }
    if (trueOutline.current) {
      trueOutline.current.material.opacity = outline;
      trueOutline.current.visible = outline > 0;
    }
    if (dimension.current) dimension.current.visible = labelIn > 0;
    if (label.current) label.current.style.opacity = String(labelIn);
  };

  // Static ghosts sit at the end state. The active one follows the reveal timeline.
  useEffect(() => {
    if (!active) pose(1, 1, 1, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, to[0], to[2]]);

  useFrame((state) => {
    if (!active) return;
    const r = reveal.current!;
    if (r.key !== item.key) return;
    if (r.phase === "camera") {
      pose(0, 0, 0, true);
      return;
    }
    if (r.phase === "done") {
      pose(1, 1, 1, true);
      return;
    }
    if (r.phase !== "play") return;
    const ms = (state.clock.getElapsedTime() - r.t0) * 1000;
    const outline = easeOut(ms / OUTLINE_MS);
    const grow = easeOut((ms - OUTLINE_MS) / GROW_MS);
    const labelIn = easeOut((ms - OUTLINE_MS - GROW_MS) / LABEL_MS);
    pose(outline, grow, labelIn, true);
    if (ms >= OUTLINE_MS + GROW_MS + LABEL_MS) {
      r.phase = "done";
      pose(1, 1, 1, true);
    }
    state.invalidate();
  });

  const events = {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
    },
    onPointerOut: () => setHovered(false),
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      onSelect?.(element.id, item.key);
    },
  };

  return (
    <group visible={!hidden}>
      {/* True element: drawn in ink as the reveal starts, then holds. */}
      <group position={from} rotation-y={trueRot} visible={!solo}>
        <Line ref={trueOutline} points={boxEdges(trueSize)} segments color={color.ink} lineWidth={2.5} transparent />
      </group>

      <group ref={group} position={to} rotation-y={rotY}>
        <mesh ref={fill} geometry={unitBox} material={ghostFill} scale={size} renderOrder={2} {...events} />
        <Line
          ref={edges}
          points={boxEdges(size)}
          segments
          color={color.redline}
          lineWidth={hovered ? 2.5 : 1.75}
          dashed
          dashSize={0.16}
          gapSize={0.1}
          transparent
        />
      </group>

      <group visible={!solo}>
      <group ref={dimension}>
        <Line points={dimPoints} color={color.redline} lineWidth={1.25} />
        <Line points={ticks} segments color={color.redline} lineWidth={1.25} />
        <Html
          portal={layer}
          position={[(from[0] + to[0]) / 2, top + 0.05, (from[2] + to[2]) / 2]}
          center
          zIndexRange={[20, 10]}
          style={{ pointerEvents: "none" }}
        >
          <div
            ref={label}
            style={{
              fontFamily: font.family,
              fontStretch: "80%",
              fontWeight: 600,
              fontSize: 13,
              color: color.redline,
              background: color.paper,
              padding: "2px 5px",
              transform: "translateY(-14px)",
              whiteSpace: "nowrap",
              userSelect: "none",
              display: hidden || solo ? "none" : undefined,
            }}
          >
            {ghost.label}
          </div>
        </Html>
      </group>
      </group>
    </group>
  );
}

// ---------- Lens: the record where this crew has not heard it ----------

/**
 * The recorded element, dashed, where the crew believes otherwise: ink-soft when it does not meet
 * their work, redline (with the ghost fill) when the checks found their planned work meets it.
 */
function LensDiff3D({ element, lens, exposed }: { element: Element; lens?: Crew; exposed: boolean }) {
  const layer = useLabelLayer();
  const belief = lens ? beliefGeometry(element, lens) : element.geometry;
  const on = !!lens && !sameGeometry(belief, element.geometry);
  const truth = useMemo(() => elementSolid(element), [element]);
  const believed = useMemo(() => solidFor(belief, element.type, element.height), [belief, element]);
  const invalidate = useThree((s) => s.invalidate);
  useEffect(() => invalidate(), [on, exposed, invalidate]);
  if (truth.kind !== "box" || believed.kind !== "box") return null;
  const tone = exposed ? color.redline : color.inkSoft;
  const top = truth.size[1] + 0.45;
  const a: [number, number, number] = [believed.center[0], top, believed.center[2]];
  const b: [number, number, number] = [truth.center[0], top, truth.center[2]];
  return (
    <group visible={on}>
      <group position={truth.center} rotation-y={truth.rotY}>
        <mesh geometry={unitBox} material={ghostFill} scale={truth.size} renderOrder={2} visible={on && exposed} />
        <Line points={boxEdges(truth.size)} segments color={tone} lineWidth={1.75} dashed dashSize={0.16} gapSize={0.1} />
      </group>
      <Line points={[a, b]} color={tone} lineWidth={1.25} />
      <Html portal={layer} position={[(a[0] + b[0]) / 2, top + 0.05, (a[2] + b[2]) / 2]} center zIndexRange={[20, 10]} style={{ pointerEvents: "none" }}>
        <div
          style={{
            display: on ? undefined : "none",
            fontFamily: font.family,
            fontStretch: "80%",
            fontWeight: 600,
            fontSize: 13,
            color: tone,
            background: color.paper,
            padding: "2px 5px",
            transform: "translateY(-14px)",
            whiteSpace: "nowrap",
            userSelect: "none",
          }}
        >
          {on ? `${offsetLabel(belief, element.geometry)}${exposed ? " · not heard, meets their work" : " · not heard"}` : ""}
        </div>
      </Html>
    </group>
  );
}

// ---------- Drafting grid bubbles: lettered columns (x), numbered rows (y), every 5 m ----------

const BUBBLE_R = 0.42;
const circle = (r: number): [number, number, number][] =>
  Array.from({ length: 41 }, (_, i) => {
    const a = (i / 40) * Math.PI * 2;
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  });
const BUBBLE = circle(BUBBLE_R);

function GridBubbles({ bounds }: { bounds: ReturnType<typeof planBounds> }) {
  const layer = useLabelLayer();
  const lines = useMemo(() => {
    const x0 = Math.floor(bounds.minX / 5) * 5;
    const x1 = Math.ceil(bounds.maxX / 5) * 5;
    const y0 = Math.floor(bounds.minY / 5) * 5;
    const y1 = Math.ceil(bounds.maxY / 5) * 5;
    const out: { id: string; label: string; from: [number, number, number]; to: [number, number, number]; at: [number, number, number] }[] = [];
    let i = 0;
    for (let x = x0; x <= x1; x += 5, i++) {
      const south = -(y0 - 1.6);
      out.push({ id: `x${x}`, label: String.fromCharCode(65 + i), from: [x, 0.003, south], to: [x, 0.003, -(y1 + 0.8)], at: [x, 0.003, south + BUBBLE_R] });
    }
    i = 1;
    for (let y = y0; y <= y1; y += 5, i++) {
      const west = x0 - 1.6;
      out.push({ id: `y${y}`, label: String(i), from: [west, 0.003, -y], to: [x1 + 0.8, 0.003, -y], at: [west - BUBBLE_R, 0.003, -y] });
    }
    return out;
  }, [bounds]);

  return (
    <group>
      {lines.map((l) => (
        <group key={l.id}>
          <Line points={[l.from, l.to]} color={color.inkSoft} lineWidth={0.8} dashed dashSize={0.6} gapSize={0.25} transparent opacity={0.7} />
          <group position={l.at}>
            <Line points={BUBBLE} color={color.inkSoft} lineWidth={1} />
          </group>
          <Html portal={layer} position={l.at} center zIndexRange={[5, 0]} style={{ pointerEvents: "none" }}>
            <div style={{ ...labelStyle(false), fontSize: 11, fontWeight: 600 }}>{l.label}</div>
          </Html>
        </group>
      ))}
    </group>
  );
}
