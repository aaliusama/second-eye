import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Crew, Element, ElementState, Finding, Geometry, PlanTask, Point, Scene } from "@site/contracts";
import {
  beliefGeometry,
  beliefState,
  blendGeometry,
  offsetLabel,
  sameGeometry,
  threadLabel,
  unheardChanges,
  boxOf,
  containingPlace,
  crewById,
  crewHue,
  crewName,
  easeInOut,
  easeOut,
  elementById,
  findingKey,
  lerpBox,
  midpoint,
  pointsOf,
  segmentOutline,
  STORY_ELEMENT,
  type Box,
} from "./derive";
import { clearanceTone, clearanceWords, faceGeometry, overlapLabel } from "./depth";
import { phase, REVEAL } from "./reveal";
import type { Selection } from "./store";
import { color, drawing, font } from "./tokens";

// Owner: D. Top-down SVG plan in drafting conventions (web/AGENTS.md). Works without WebGL.
// Plan coordinates: metres, x east, y north. SVG y points down, so every y is negated.

const P = (p: Point): [number, number] => [p[0], -p[1]];
const poly = (ps: Point[]) => ps.map((p) => P(p).join(",")).join(" ");

export interface FlatViewProps {
  scene: Scene;
  /** Unresolved findings that carry a ghost, already deduped by finding id. */
  ghosts: Finding[];
  /** Elements in an active, unresolved finding. */
  conflictIds: Set<string>;
  /** Elements whose finding was fixed. */
  clearIds: Set<string>;
  /** Findings whose correction was sent and awaits the crew's confirmation: drawn amber, not red. */
  sentIds?: Set<string>;
  /** Presenter story beats: frame the revealed wall tightly so the offset reads on a projector. */
  tight?: boolean;
  /** Tasks active at the slider position, for crew badges. */
  activeTasks: PlanTask[];
  selection: Selection;
  focusElementId?: string;
  onSelect: (s: Selection) => void;
  reveal: { key?: string; elapsed: number };
  /** Draw the floor as this crew knows it. The record is drawn behind wherever they differ. */
  lens?: Crew;
  /** Elements this crew's planned work touches: an unheard change there is drawn in redline. */
  exposedIds?: Set<string>;
  /** Open findings with measured geometry (lane B): work-zone strip and faces, or the overlap of a clash. */
  measured?: Finding[];
}

const LENS_MS = 520;

/** 0..1 progress of the glide between the previous lens and the current one. Answers a user action. */
function useLensGlide(lens: Crew | undefined): { from?: Crew; t: number } {
  const prev = useRef<Crew | undefined>(lens);
  const [state, setState] = useState<{ from?: Crew; t: number }>({ t: 1 });
  useEffect(() => {
    const from = prev.current;
    prev.current = lens;
    if (from?.id === lens?.id) return;
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return setState({ t: 1 });
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / LENS_MS);
      setState({ from, t });
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [lens]);
  return state;
}

type Look = { stroke: string; width: number; dash?: string; fill: string; fillOpacity: number };

function look(state: ElementState, type: Element["type"]): Look {
  const area = type === "room" || type === "zone";
  switch (state) {
    case "planned":
      return { stroke: color.inkSoft, width: drawing.hairline, fill: "none", fillOpacity: 0 };
    case "proposed":
      return { stroke: color.pending, width: drawing.outline, dash: "0.25 0.15", fill: "none", fillOpacity: 0 };
    case "approved":
      return { stroke: color.ink, width: area ? drawing.hairline * 1.5 : drawing.outline, fill: "none", fillOpacity: 0 };
    case "built":
      // A built room is not a black block: rooms and zones get a light ink wash, walls solid ink.
      return { stroke: color.ink, width: drawing.outline, fill: color.ink, fillOpacity: area ? 0.06 : 1 };
    case "unconfirmed":
      return { stroke: color.pending, width: drawing.outline, fill: "url(#hatch-pending)", fillOpacity: 1 };
    case "conflict":
      return { stroke: color.redline, width: drawing.heavy, fill: "none", fillOpacity: 0 };
  }
}

function outlineOf(g: Geometry): Point[] | undefined {
  if (g.kind === "segment") return segmentOutline(g.from, g.to, g.thickness);
  if (g.kind === "polygon") return g.points;
  return undefined;
}

function Shape({ g, l, pathLength, offset }: { g: Geometry; l: Look; pathLength?: boolean; offset?: number }) {
  const common = {
    stroke: l.stroke,
    strokeWidth: l.width,
    strokeDasharray: pathLength ? 1 : l.dash,
    strokeDashoffset: pathLength ? offset : undefined,
    pathLength: pathLength ? 1 : undefined,
    fill: l.fill,
    fillOpacity: l.fillOpacity,
    strokeLinejoin: "miter" as const,
    vectorEffect: undefined,
  };
  const outline = outlineOf(g);
  if (outline) return <polygon points={poly(outline)} {...common} />;
  // A point item (a fixture, a tile choice) is a small quiet marker, never a blot over labels.
  const [x, y] = P((g as { at: Point }).at);
  return <circle cx={x} cy={y} r={0.11} {...common} strokeWidth={drawing.hairline} fill={color.paper} fillOpacity={1} />;
}

const onKey = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
};

/** Invisible wide hit area, so a 12 cm wall is still easy to click. */
function Hit({ g, label, onClick, selected }: { g: Geometry; label: string; onClick: () => void; selected: boolean }) {
  const outline = outlineOf(g);
  const area = g.kind === "polygon";
  const props = {
    className: `hit${selected ? " selected" : ""}`,
    role: "button",
    tabIndex: 0,
    "aria-label": label,
    "aria-pressed": selected,
    onClick: (e: React.MouseEvent) => {
      e.stopPropagation();
      onClick();
    },
    onKeyDown: onKey(onClick),
  };
  if (g.kind === "point") {
    const [x, y] = P(g.at);
    // Transparent: an SVG circle with no fill paints black.
    return (
      <circle cx={x} cy={y} r={0.35} fill="transparent" {...props}>
        <title>{label}</title>
      </circle>
    );
  }
  return (
    <polygon
      points={poly(outline!)}
      fill={area ? "transparent" : "none"}
      stroke="transparent"
      strokeWidth={area ? 0.05 : 0.6}
      pointerEvents={area ? "all" : "stroke"}
      {...props}
    />
  );
}

const letters = (i: number) => String.fromCharCode(65 + (i % 26));

function Grid({ box }: { box: Box }) {
  const step = drawing.gridStep;
  const xs: number[] = [];
  const ys: number[] = [];
  for (let x = Math.ceil(box.minX / step) * step; x <= box.maxX; x += step) xs.push(x);
  for (let y = Math.ceil(box.minY / step) * step; y <= box.maxY; y += step) ys.push(y);
  const r = drawing.bubbleRadius;
  const top = -(box.maxY + r * 1.6);
  const left = box.minX - r * 1.6;
  return (
    <g aria-hidden="true">
      {xs.map((x, i) => (
        <g key={`x${x}`}>
          <line x1={x} y1={top + r} x2={x} y2={-box.minY} stroke={color.paperRule} strokeWidth={drawing.hairline} />
          <circle cx={x} cy={top} r={r} fill={color.paper} stroke={color.inkSoft} strokeWidth={drawing.hairline} />
          <text x={x} y={top} className="bubble" fontSize={r * 0.95}>
            {letters(i)}
          </text>
        </g>
      ))}
      {ys.map((y, i) => (
        <g key={`y${y}`}>
          <line x1={left + r} y1={-y} x2={box.maxX} y2={-y} stroke={color.paperRule} strokeWidth={drawing.hairline} />
          <circle cx={left} cy={-y} r={r} fill={color.paper} stroke={color.inkSoft} strokeWidth={drawing.hairline} />
          <text x={left} y={-y} className="bubble" fontSize={r * 0.95}>
            {i + 1}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Dimension line between where the crew thinks the element is and where it is per the record. */
function Dimension({
  ghost,
  truth,
  label,
  opacity,
  tone = color.redline,
}: {
  ghost: Geometry;
  truth: Geometry;
  label: string;
  opacity: number;
  tone?: string;
}) {
  const g = midpoint(ghost);
  const c = midpoint(truth);
  const dx = c[0] - g[0];
  const dy = c[1] - g[1];
  const len = Math.hypot(dx, dy);
  if (len < 1e-3) {
    const [x, y] = P(g);
    return (
      <text x={x} y={y - 0.4} className="dim-label" fontSize={drawing.smallLabel} opacity={opacity} style={{ fill: tone }}>
        {label}
      </text>
    );
  }
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const extent = Math.max(...pointsOf(ghost).map((p) => (p[0] - g[0]) * nx + (p[1] - g[1]) * ny), 0);
  const off = extent + 0.7;
  const a: Point = [g[0] + nx * off, g[1] + ny * off];
  const b: Point = [c[0] + nx * off, c[1] + ny * off];
  const ext = (o: Point): [Point, Point] => [
    [o[0] + nx * (extent + 0.12), o[1] + ny * (extent + 0.12)],
    [o[0] + nx * (off + 0.2), o[1] + ny * (off + 0.2)],
  ];
  const tick = (p: Point) => {
    const s = 0.14;
    const [x1, y1] = P([p[0] - (ux + nx) * s, p[1] - (uy + ny) * s]);
    const [x2, y2] = P([p[0] + (ux + nx) * s, p[1] + (uy + ny) * s]);
    return <line x1={x1} y1={y1} x2={x2} y2={y2} />;
  };
  const line = (p: [Point, Point], key: string) => {
    const [x1, y1] = P(p[0]);
    const [x2, y2] = P(p[1]);
    return <line key={key} x1={x1} y1={y1} x2={x2} y2={y2} />;
  };
  const mid = P([(a[0] + b[0]) / 2 + nx * 0.45, (a[1] + b[1]) / 2 + ny * 0.45]);
  return (
    <g opacity={opacity} stroke={tone} strokeWidth={drawing.hairline}>
      {line(ext(g), "eg")}
      {line(ext(c), "ec")}
      {line([a, b], "d")}
      {tick(a)}
      {tick(b)}
      <text x={mid[0]} y={mid[1]} className="dim-label" fontSize={drawing.smallLabel} stroke="none" style={{ fill: tone }}>
        {label}
      </text>
    </g>
  );
}

function RoomLabel({ el, tasks, scene }: { el: Element; tasks: PlanTask[]; scene: Scene }) {
  if (el.geometry.kind !== "polygon") return null;
  const b = boxOf(el.geometry.points);
  const cx = (b.minX + b.maxX) / 2;
  const top = -(b.maxY - 1.1);
  // One badge per crew: a crew restating a recorded plan is still one crew in the room.
  const here = [...new Map(tasks.filter((t) => t.placeId === el.id).map((t) => [t.crewId, t])).values()];
  const s = drawing.labelSize;
  return (
    <g pointerEvents="none">
      <text x={cx} y={top} className="room-label" fontSize={s}>
        {el.name}
      </text>
      {el.aliases.length > 0 && (
        <text x={cx} y={top + s * 1.1} className="alias-label" fontSize={drawing.smallLabel}>
          {el.aliases.map((a) => `“${a}”`).join(" ")}
        </text>
      )}
      {here.map((t, i) => {
        const crew = crewById(scene, t.crewId);
        const x = cx + (i - (here.length - 1) / 2) * 1.0;
        const y = top + s * 2.4;
        return (
          <g key={t.id}>
            <rect x={x - 0.38} y={y - 0.38} width={0.76} height={0.76} fill={color.paper} stroke={crewHue(scene, t.crewId)} strokeWidth={drawing.outline} />
            <text x={x} y={y} className="badge-letter" fontSize={0.48}>
              {crew?.letter ?? "?"}
            </text>
          </g>
        );
      })}
    </g>
  );
}

const TONE = { redline: color.redline, pending: color.pending, soft: color.inkSoft } as const;

/**
 * Lane B's measured geometry, in drafting conventions. Clearance: the work-zone strip (soft hatch),
 * the recorded face (ink) and the face the crew believes in (redline, the conflict itself), with the
 * measured offset. Overlap: each crew's work zone dashed in its hue, the shared area hatched in redline.
 */
function MeasureLayer({ f, scene, opacity, sent }: { f: Finding; scene: Scene; opacity: number; sent: boolean }) {
  const c = f.measure?.clearance;
  const o = f.measure?.overlap;
  if (opacity <= 0 || (!c && !o)) return null;
  const s = drawing.smallLabel * 0.8;
  return (
    <g opacity={opacity} pointerEvents="none" className="measure">
      {c && (() => {
        const tone = TONE[clearanceTone(c, sent)];
        const zone = c.workZone.kind === "polygon" ? c.workZone.points : undefined;
        const zb = zone ? boxOf(zone) : undefined;
        const [l1, l2] = clearanceWords(c);
        const towardFace = midpoint(faceGeometry(c.recordedFace))[0] >= (zb ? (zb.minX + zb.maxX) / 2 : 0);
        // Two lines, both above the strip, so the note never covers the hatch or the faces.
        const [tx, ty] = zb ? P([towardFace ? zb.maxX : zb.minX, zb.maxY + 0.35 + s * 1.2]) : [0, 0];
        const line = (face: [Point, Point], stroke: string, width: number, dash?: string) => {
          const [x1, y1] = P(face[0]);
          const [x2, y2] = P(face[1]);
          return <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={stroke} strokeWidth={width} strokeDasharray={dash} />;
        };
        return (
          <g>
            {zone && <polygon points={poly(zone)} fill="url(#hatch-zone)" stroke={color.inkSoft} strokeWidth={drawing.hairline} strokeDasharray="0.12 0.08" />}
            {line(c.recordedFace, color.ink, drawing.outline)}
            {line(c.believedFace, tone, drawing.outline, "0.16 0.1")}
            {!f.ghost && <Dimension ghost={faceGeometry(c.believedFace)} truth={faceGeometry(c.recordedFace)} label={`${c.offsetM.toFixed(2)} m ${c.direction}`} opacity={1} tone={tone} />}
            {zb && (
              <text x={tx} y={ty} className="ghost-note" fontSize={s} style={{ textAnchor: towardFace ? "end" : "start", fill: color.inkSoft, paintOrder: "stroke", stroke: color.paper, strokeWidth: 0.1 }}>
                <tspan x={tx}>{l1}</tspan>
                <tspan x={tx} dy="1.2em" style={{ fill: tone }}>{l2}</tspan>
              </text>
            )}
          </g>
        );
      })()}
      {o && (() => {
        const shared = o.zone.kind === "polygon" ? o.zone.points : undefined;
        const sb = shared ? boxOf(shared) : undefined;
        const [cx, cy] = sb ? P([(sb.minX + sb.maxX) / 2, sb.minY + 0.3]) : [0, 0];
        return (
          <g>
            {o.zones.map((z) => z.zone.kind === "polygon" && (() => {
              const b = boxOf(z.zone.points);
              // Letter at the top-left of the zone; the shared-area label sits at the bottom, clear of ghost notes.
              const [lx, ly] = P([b.minX + 0.3, b.maxY - 0.5]);
              return (
                <g key={`${z.crewId}-${z.taskId}`}>
                  <polygon points={poly(z.zone.points)} fill="none" stroke={crewHue(scene, z.crewId)} strokeWidth={drawing.outline} strokeDasharray="0.2 0.12" />
                  <text x={lx} y={ly} className="badge-letter" fontSize={s} style={{ fill: crewHue(scene, z.crewId) }}>
                    {crewById(scene, z.crewId)?.letter ?? "?"}
                  </text>
                </g>
              );
            })())}
            {shared && <polygon points={poly(shared)} fill="url(#hatch-clash)" stroke={color.redline} strokeWidth={drawing.outline} />}
            {shared && (
              <text x={cx} y={cy} className="dim-label" fontSize={drawing.smallLabel} style={{ fill: color.redline, paintOrder: "stroke", stroke: color.paper, strokeWidth: 0.12 }}>
                {overlapLabel(o.areaM2)}
              </text>
            )}
          </g>
        );
      })()}
    </g>
  );
}

export function FlatView(props: FlatViewProps) {
  const { scene, ghosts, conflictIds, clearIds, activeTasks, selection, onSelect, reveal, sentIds, tight = false, lens, exposedIds, measured = [] } = props;
  const glide = useLensGlide(lens);
  const [whole, setWhole] = useState<string | undefined>(undefined);
  const [comparison, setComparison] = useState<"compare" | "earlier" | "latest">("compare");
  useEffect(() => setComparison("compare"), [reveal.key, tight]);

  const base = useMemo(() => {
    const all = scene.elements.flatMap((e) => pointsOf(e.geometry));
    return all.length ? boxOf(all, 1.5) : undefined;
  }, [scene]);

  // In the story beats there is one ghost on screen: frame it even after its reveal has played.
  const selectedElement = props.focusElementId ?? (selection?.kind === "element" ? selection.id : undefined);
  const chosen = selection?.kind === "finding" ? ghosts.find((f) => findingKey(f) === selection.key) : undefined;
  const revealed = chosen ?? (selectedElement ? ghosts.find((f) => f.ghost?.elementId === selectedElement) : ghosts.find((f) => findingKey(f) === reveal.key)) ?? (tight ? ghosts[0] : undefined);
  const revealedEl = elementById(scene, selectedElement ?? revealed?.ghost?.elementId ?? (tight ? STORY_ELEMENT : undefined));

  const focus = useMemo((): Box | undefined => {
    if (!revealedEl) return undefined;
    const pts = [...(revealed?.ghost ? pointsOf(revealed.ghost.geometry) : []), ...pointsOf(revealedEl.geometry)];
    if (tight) {
      // Close on the wall: the offset has to read at 1440x900 and on a projector. Room above for the dimension.
      const t = boxOf(pts, 1.6);
      t.maxY += 1.2;
      const minW = 7;
      const w = t.maxX - t.minX;
      if (w < minW) {
        t.minX -= (minW - w) / 2;
        t.maxX += (minW - w) / 2;
      }
      return t;
    }
    const place = containingPlace(scene, midpoint(revealedEl.geometry));
    const b = boxOf(place && place.geometry.kind === "polygon" ? [...pts, ...place.geometry.points] : pts, 2.5);
    // Keep the framed view wide enough that the neighbouring rooms still give context.
    const minW = 14;
    const w = b.maxX - b.minX;
    if (w < minW) {
      b.minX -= (minW - w) / 2;
      b.maxX += (minW - w) / 2;
    }
    return b;
  }, [revealed, revealedEl, scene, tight]);

  if (!base) return <p className="empty">No elements in the record.</p>;

  const frameKey = selection?.kind === "finding" ? selection.key : selectedElement ?? reveal.key ?? "story";
  const framing = focus && (tight || selection !== undefined) && whole !== frameKey;
  const box = framing ? lerpBox(base, focus, easeInOut(phase(reveal.elapsed, 0, REVEAL.frameEnd))) : base;
  const r = drawing.bubbleRadius;
  const vb = { x: box.minX - r * 3.4, y: -box.maxY - r * 3.4, w: box.maxX - box.minX + r * 3.6, h: box.maxY - box.minY + r * 3.6 };

  // Through a crew's eyes, conflicts and fixes are the record's business: draw what they believe, plainly.
  const stateOf = (el: Element): ElementState => (lens ? beliefState(el, lens) : conflictIds.has(el.id) ? "conflict" : el.state);
  const selectedId = selection?.kind === "element" ? selection.id : undefined;
  const areas = scene.elements.filter((e) => e.type === "room" || e.type === "zone");
  const solids = scene.elements.filter((e) => !(e.type === "room" || e.type === "zone"));
  const geomOf = (el: Element): Geometry => {
    const to = beliefGeometry(el, lens);
    if (glide.t >= 1) return to;
    return blendGeometry(beliefGeometry(el, glide.from), to, easeInOut(glide.t));
  };
  // Where this crew's floor differs from the record: geometry they have not heard.
  const differs = lens ? solids.filter((el) => !sameGeometry(beliefGeometry(el, lens), el.geometry)) : [];

  const drawEl = (el: Element): ReactNode => {
    const l = look(stateOf(el), el.type);
    const lk = !lens && clearIds.has(el.id) && !conflictIds.has(el.id) ? { ...l, stroke: color.clear, width: drawing.heavy } : l;
    const g = geomOf(el);
    return (
      <g key={el.id}>
        <Shape g={g} l={lk} />
        {selectedId === el.id && <Shape g={g} l={{ stroke: color.ink, width: drawing.heavy, dash: "0.12 0.12", fill: "none", fillOpacity: 0 }} />}
      </g>
    );
  };

  return (
    <div className="flat">
      <svg
        viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="group"
        aria-label={`${scene.name}, top-down plan`}
        onClick={() => onSelect(undefined)}
        style={{ fontFamily: font.family }}
      >
        <defs>
          <pattern id="hatch-pending" width={0.3} height={0.3} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={0.3} stroke={color.pending} strokeWidth={0.06} />
          </pattern>
          <pattern id="hatch-zone" width={drawing.hatchStep} height={drawing.hatchStep} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <line x1={0} y1={0} x2={0} y2={drawing.hatchStep} stroke={color.inkSoft} strokeWidth={drawing.hatchWidth} />
          </pattern>
          <pattern id="hatch-clash" width={drawing.hatchStep} height={drawing.hatchStep} patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
            <line x1={0} y1={0} x2={0} y2={drawing.hatchStep} stroke={color.redline} strokeWidth={drawing.hatchWidth * 1.5} />
          </pattern>
        </defs>
        <Grid box={base} />
        {areas.map(drawEl)}
        {solids.filter((el) => !(comparison === "earlier" && ghosts.some((f) => f.ghost?.elementId === el.id))).map(drawEl)}
        {!lens && comparison === "compare" && measured.map((f, i) => {
          // Several crews on the same old face measure the same strip: draw it once.
          const c = f.measure?.clearance;
          const same = (g: Finding) => g.measure?.clearance && c &&
            JSON.stringify([g.measure.clearance.believedFace, g.measure.clearance.workZone]) === JSON.stringify([c.believedFace, c.workZone]);
          if (c && !f.measure?.overlap && measured.slice(0, i).some((g) => !g.measure?.overlap && same(g))) return null;
          // A clash whose work is already drawn as a ghost would bury the ghost under a second drawing in the same
          // spot: show it only while that clash is selected (it stays listed under Priorities).
          const clashOnGhost = f.measure?.overlap && ghosts.some((g) => g.taskIds.some((t) => f.taskIds.includes(t)));
          if (clashOnGhost && !(selection?.kind === "finding" && selection.key === findingKey(f))) return null;
          // The revealed ghost's numbers arrive with its dimension line, not before.
          const key = findingKey(f);
          const ghostKey = f.ghost ? ghosts.find((g) => g.id === f.id || g.ghost?.elementId === f.ghost?.elementId) : undefined;
          const playing = ghostKey ? findingKey(ghostKey) === reveal.key : key === reveal.key;
          return <MeasureLayer key={`m-${key}`} f={f} scene={scene} opacity={playing ? phase(reveal.elapsed, REVEAL.growEnd, REVEAL.total) : 1} sent={sentIds?.has(f.id) ?? false} />;
        })}
        {areas.map((el) => (
          <RoomLabel key={`l-${el.id}`} el={el} tasks={activeTasks} scene={scene} />
        ))}

        {[...areas, ...solids].map((el) => (
          <Hit
            key={`h-${el.id}`}
            g={el.geometry}
            label={`${el.name}, ${stateOf(el)}`}
            selected={selectedId === el.id}
            onClick={() => onSelect({ kind: "element", id: el.id })}
          />
        ))}
        {lens && differs.map((el) => {
          const belief = beliefGeometry(el, lens);
          const exposed = exposedIds?.has(el.id) ?? false;
          const tone = exposed ? color.redline : color.inkSoft;
          const opacity = easeOut(Math.max(0, (glide.t - 0.55) / 0.45));
          const last = unheardChanges(el, lens).filter((h) => h.geometry).at(-1);
          const m = midpoint(el.geometry);
          const east = m[0] >= midpoint(belief)[0];
          const [lx, ly] = P([m[0] + (east ? 0.35 : -0.35), m[1]]);
          return (
            <g key={`unheard-${el.id}`} opacity={opacity} pointerEvents="none">
              <Shape g={el.geometry} l={{ stroke: tone, width: drawing.outline, dash: "0.2 0.12", fill: tone, fillOpacity: exposed ? drawing.ghostOpacity : 0.06 }} />
              <Dimension ghost={belief} truth={el.geometry} label={offsetLabel(belief, el.geometry)} opacity={1} tone={tone} />
              {exposed && <text x={lx} y={ly} className="ghost-note" fontSize={drawing.smallLabel * 0.8} style={{ textAnchor: east ? "start" : "end", fill: tone }}>
                <tspan x={lx}>Per the record, where they work</tspan>
                <tspan x={lx} dy="1.2em">{last ? `${threadLabel(scene, last.thread)}, not heard` : "Not heard"}</tspan>
              </text>}
            </g>
          );
        })}
        {(comparison === "latest" || lens ? [] : ghosts).map((f) => {
          const truth = elementById(scene, f.ghost!.elementId);
          if (!truth) return null;
          const key = findingKey(f);
          const playing = key === reveal.key;
          const e = playing ? reveal.elapsed : REVEAL.total;
          const draw = phase(e, REVEAL.frameEnd, REVEAL.drawEnd);
          const grow = easeOut(phase(e, REVEAL.drawEnd, REVEAL.growEnd));
          const dim = phase(e, REVEAL.growEnd, REVEAL.total);
          const g = blendGeometry(truth.geometry, f.ghost!.geometry, grow);
          const selected = selection?.kind === "finding" && selection.key === key;
          // Several crews can hold the same old position of one element: one dimension and one note for all of them,
          // drawn by the ghost being revealed if it is one of them, else the first.
          const group = ghosts.filter((g) => g.ghost?.elementId === f.ghost!.elementId);
          const rep = group.find((g) => findingKey(g) === reveal.key) ?? group[0]!;
          const labelled = rep.id === f.id;
          const crewIds = [...new Set(group.flatMap((g) => g.crewIds))];
          const crews = f.crewIds.map((id) => crewName(scene, id)).join(", ");
          const noteCrews = crewIds.length === 1
            ? crewName(scene, crewIds[0]!)
            : `${crewIds.length} crews: ${crewIds.map((id) => crewById(scene, id)?.letter ?? "?").join(", ")}`;
          const sentCount = group.filter((g) => sentIds?.has(g.id)).length;
          // Note sits beside the ghost, on the side away from the true element, so it never covers labels below.
          const gm = midpoint(f.ghost!.geometry);
          const west = midpoint(truth.geometry)[0] >= gm[0];
          const [lx, ly] = P([gm[0] + (west ? -0.35 : 0.35), gm[1]]);
          const anchor = west ? "end" : "start";
          // Correction sent to every crew on this ghost, none confirmed yet: still open, but amber, not red.
          const tone = sentCount === group.length ? color.pending : color.redline;
          return (
            <g key={key}>
              {draw > 0 && comparison !== "earlier" && (
                <Shape g={truth.geometry} l={{ stroke: color.ink, width: drawing.heavy, fill: "none", fillOpacity: 0 }} pathLength offset={1 - draw} />
              )}
              {grow > 0 && (
                <g className="ghost">
                  {labelled && <Shape
                    g={g}
                    l={{ stroke: tone, width: drawing.outline, dash: "0.2 0.12", fill: tone, fillOpacity: drawing.ghostOpacity }}
                  />}
                  <Hit
                    g={g}
                    label={`Earlier recorded position for ${crews}: ${truth.name}. ${f.summary}`}
                    selected={selected}
                    onClick={() => onSelect({ kind: "finding", key })}
                  />
                </g>
              )}
              {dim > 0 && comparison === "compare" && labelled && (
                <>
                  <Dimension ghost={f.ghost!.geometry} truth={truth.geometry} label={f.ghost!.label} opacity={dim} tone={tone} />
                  <text
                    x={lx}
                    y={ly}
                    className="ghost-note"
                    fontSize={drawing.smallLabel * 0.8}
                    opacity={dim}
                    style={{ textAnchor: anchor, fill: tone }}
                  >
                    <tspan x={lx}>{noteCrews}</tspan>
                    <tspan x={lx} dy="1.2em">
                      {sentCount === group.length
                        ? "sent, not confirmed"
                        : sentCount > 0
                          ? `earlier recorded position · ${sentCount} sent`
                          : "earlier recorded position"}
                    </tspan>
                  </text>
                </>
              )}
            </g>
          );
        })}

      </svg>
      {ghosts.length > 0 && !lens && <div className="comparison-tools" role="group" aria-label="Compare recorded positions">
        {([ ["earlier", "Earlier position"], ["compare", "Compare"], ["latest", "Latest record"] ] as const).map(([mode, label]) => <button type="button" key={mode} aria-pressed={comparison === mode} onClick={() => setComparison(mode)}>{label}</button>)}
        <span>Display only · recorded geometry</span>
      </div>}
      {framing && phase(reveal.elapsed, 0, REVEAL.total) === 1 && (
        <button type="button" className="quiet whole" onClick={() => setWhole(frameKey)}>
          Whole floor
        </button>
      )}
    </div>
  );
}
