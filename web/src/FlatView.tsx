import { useMemo, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Element, ElementState, Finding, Geometry, PlanTask, Point, Scene } from "@site/contracts";
import {
  blendGeometry,
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
  type Box,
} from "./derive";
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
  onSelect: (s: Selection) => void;
  reveal: { key?: string; elapsed: number };
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

export function FlatView(props: FlatViewProps) {
  const { scene, ghosts, conflictIds, clearIds, activeTasks, selection, onSelect, reveal, sentIds, tight = false } = props;
  const [whole, setWhole] = useState<string | undefined>(undefined);

  const base = useMemo(() => {
    const all = scene.elements.flatMap((e) => pointsOf(e.geometry));
    return all.length ? boxOf(all, 1.5) : undefined;
  }, [scene]);

  // In the story beats there is one ghost on screen: frame it even after its reveal has played.
  const revealed = ghosts.find((f) => findingKey(f) === reveal.key) ?? (tight ? ghosts[0] : undefined);
  const revealedEl = elementById(scene, revealed?.ghost?.elementId);

  const focus = useMemo((): Box | undefined => {
    if (!revealed?.ghost || !revealedEl) return undefined;
    const pts = [...pointsOf(revealed.ghost.geometry), ...pointsOf(revealedEl.geometry)];
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

  const framing = focus && (tight || selection !== undefined) && whole !== reveal.key;
  const box = framing ? lerpBox(base, focus, easeInOut(phase(reveal.elapsed, 0, REVEAL.frameEnd))) : base;
  const r = drawing.bubbleRadius;
  const vb = { x: box.minX - r * 3.4, y: -box.maxY - r * 3.4, w: box.maxX - box.minX + r * 3.6, h: box.maxY - box.minY + r * 3.6 };

  const stateOf = (el: Element): ElementState => (conflictIds.has(el.id) ? "conflict" : el.state);
  const selectedId = selection?.kind === "element" ? selection.id : undefined;
  const areas = scene.elements.filter((e) => e.type === "room" || e.type === "zone");
  const solids = scene.elements.filter((e) => !(e.type === "room" || e.type === "zone"));

  const drawEl = (el: Element): ReactNode => {
    const l = look(stateOf(el), el.type);
    const lk = clearIds.has(el.id) && !conflictIds.has(el.id) ? { ...l, stroke: color.clear, width: drawing.heavy } : l;
    return (
      <g key={el.id}>
        <Shape g={el.geometry} l={lk} />
        {selectedId === el.id && <Shape g={el.geometry} l={{ stroke: color.ink, width: drawing.heavy, dash: "0.12 0.12", fill: "none", fillOpacity: 0 }} />}
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
        </defs>
        <Grid box={base} />
        {areas.map(drawEl)}
        {solids.map(drawEl)}
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
        {ghosts.map((f) => {
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
          const crews = f.crewIds.map((id) => crewName(scene, id)).join(", ");
          // Note sits beside the ghost, on the side away from the true element, so it never covers labels below.
          const gm = midpoint(f.ghost!.geometry);
          const west = midpoint(truth.geometry)[0] >= gm[0];
          const [lx, ly] = P([gm[0] + (west ? -0.35 : 0.35), gm[1]]);
          const anchor = west ? "end" : "start";
          // Correction sent, crew has not confirmed: still open, but amber, not red.
          const sent = sentIds?.has(f.id) ?? false;
          const tone = sent ? color.pending : color.redline;
          return (
            <g key={key}>
              {draw > 0 && (
                <Shape g={truth.geometry} l={{ stroke: color.ink, width: drawing.heavy, fill: "none", fillOpacity: 0 }} pathLength offset={1 - draw} />
              )}
              {grow > 0 && (
                <g className="ghost">
                  <Shape
                    g={g}
                    l={{ stroke: tone, width: drawing.outline, dash: "0.2 0.12", fill: tone, fillOpacity: drawing.ghostOpacity }}
                  />
                  <Hit
                    g={g}
                    label={`Ghost: where ${crews} last heard ${truth.name} is. ${f.summary}`}
                    selected={selected}
                    onClick={() => onSelect({ kind: "finding", key })}
                  />
                </g>
              )}
              {dim > 0 && (
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
                    <tspan x={lx}>{crews}</tspan>
                    <tspan x={lx} dy="1.2em">
                      {sent ? "sent, not confirmed" : "last heard this line"}
                    </tspan>
                  </text>
                </>
              )}
            </g>
          );
        })}

      </svg>
      {framing && phase(reveal.elapsed, 0, REVEAL.total) === 1 && (
        <button type="button" className="quiet whole" onClick={() => setWhole(reveal.key)}>
          Whole floor
        </button>
      )}
    </div>
  );
}
