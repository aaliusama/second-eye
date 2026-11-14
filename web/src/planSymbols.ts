import type { Element, Finding, Geometry, Point, Scene, Trade } from "@site/contracts";

// Shared by the flat plan and the 3D view: what a point item is (by its recorded name), which wall it
// belongs to and the one shape both renderers draw for it. The flat plan draws the shape from above, the 3D
// view extrudes the same footprint, so a door, a WC or a shower is the same object in both.
// Display only: nothing here changes the record or what the checks see.

export type V = [number, number];
export const add = (a: V, b: V, k = 1): V => [a[0] + b[0] * k, a[1] + b[1] * k];

export type ItemKind = "door" | "window" | "vanity" | "shower" | "wc" | "socket" | "light" | "finish";

/** What to draw for an element, from its type and recorded name. Unknown fixtures read as a finish tag. */
export function itemKind(el: Element): ItemKind | undefined {
  if (el.type === "door") return "door";
  if (el.type === "window") return "window";
  if (el.type !== "fixture") return undefined;
  const name = el.name.toLowerCase();
  if (/shower/.test(name)) return "shower";
  if (/\bwc\b|toilet/.test(name)) return "wc";
  if (/vanity|basin|sink/.test(name)) return "vanity";
  if (/socket|outlet/.test(name)) return "socket";
  if (/light/.test(name)) return "light";
  return "finish";
}

/** Short name for a tag or tooltip: "Unit 204 shaver socket" -> "shaver socket". */
export const shortName = (name: string) => name.replace(/^Unit \d+ /, "");

export const doorWidth = (el: Element) => (/entrance/i.test(el.name) ? 0.9 : 0.75);

const segDist = (p: V, a: V, b: V): number => {
  const ab: V = [b[0] - a[0], b[1] - a[1]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2));
  return Math.hypot(p[0] - a[0] - ab[0] * t, p[1] - a[1] - ab[1] * t);
};

export const inPoly = (p: V, pts: Point[]): boolean => {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i]!;
    const [xj, yj] = pts[j]!;
    if (yi > p[1] !== yj > p[1] && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
};

export interface WallFrame {
  /** Unit vector along the wall. */
  dir: V;
  /** Unit vector away from the wall, into the space the item serves. */
  n: V;
  /** The item sits on the wall line (a door in a wall); `wallId` is then the wall it opens. */
  onWall: boolean;
  wallId?: string;
  thickness: number;
}

type Seg = Extract<Geometry, { kind: "segment" }>;
const segOf = (g: Geometry | undefined): Seg | undefined => (g?.kind === "segment" ? g : undefined);
const mid = (g: Seg): V => [(g.from[0] + g.to[0]) / 2, (g.from[1] + g.to[1]) / 2];
const unit = (g: Seg): V => {
  const len = Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]) || 1;
  return [(g.to[0] - g.from[0]) / len, (g.to[1] - g.from[1]) / len];
};

/**
 * The wall a point item belongs to (nearest wall segment) and which way it faces. For an item on the wall
 * line (a door), `n` points into a room rather than a corridor, else toward the nearer other wall.
 */
export function wallFrame(at: V, scene: Scene): WallFrame {
  const walls = scene.elements.filter((e) => e.type === "wall" && e.geometry.kind === "segment");
  let best: { d: number; g: Seg; id: string } | undefined;
  for (const w of walls) {
    const g = w.geometry as Seg;
    const d = segDist(at, g.from, g.to);
    if (!best || d < best.d) best = { d, g, id: w.id };
  }
  if (!best) return { dir: [1, 0], n: [0, 1], onWall: false, thickness: 0 };
  const dir = unit(best.g);
  let n: V = [-dir[1], dir[0]];
  const side = (at[0] - best.g.from[0]) * n[0] + (at[1] - best.g.from[1]) * n[1];
  if (Math.abs(side) > 0.02) {
    if (side < 0) n = [-n[0], -n[1]];
  } else {
    const rooms = scene.elements.filter((e) => e.type === "room" && e.geometry.kind === "polygon");
    const inRoom = (p: V) => rooms.some((r) => inPoly(p, (r.geometry as { points: Point[] }).points));
    const host = best;
    const nearOther = (p: V) =>
      Math.min(...walls.filter((w) => w.id !== host.id).map((w) => segDist(p, (w.geometry as Seg).from, (w.geometry as Seg).to)));
    const plus = add(at, n, 0.5);
    const minus = add(at, n, -0.5);
    const flip = inRoom(plus) !== inRoom(minus) ? !inRoom(plus) : nearOther(minus) < nearOther(plus) - 1e-6;
    if (flip) n = [-n[0], -n[1]];
  }
  const onWall = best.d < 0.05;
  return { dir, n, onWall, wallId: onWall ? best.id : undefined, thickness: best.g.thickness };
}

/** The trade that builds or sets out an item, read from its recorded name. Undefined: no one trade owns it. */
export function itemTrade(el: Element): Trade | undefined {
  if (el.type !== "fixture") return undefined;
  const name = el.name.toLowerCase();
  if (/tile|tiling|grout/.test(name)) return "tiling";
  if (/paint|colou?r|primer/.test(name)) return "painting";
  if (/socket|outlet|light|switch|shaver/.test(name)) return "electrical";
  if (/\bwc\b|toilet|vanity|basin|sink|shower|tap|valve/.test(name)) return "plumbing";
  return undefined;
}

/** Footprints in metres, shared by both views. `depth` is measured away from the wall. */
const SIZE = {
  vanity: { along: 0.6, depth: 0.45, h: 0.85 },
  wc: { along: 0.4, depth: 0.65, tank: 0.18, h: 0.42, tankH: 0.8 },
  shower: { along: 0.9, depth: 0.9, h: 0.06 },
  socket: { r: 0.1, y: 1.0 },
  light: { r: 0.16 },
  finish: { r: 0.13 },
  door: { leaf: 0.05, h: 1.05 },
} as const;

/** How far from a wall's face an item of this kind still hangs on that wall (its depth plus a margin). */
const REACH: Partial<Record<ItemKind, number>> = { socket: 0.12, wc: 0.5, vanity: 0.35, shower: 0.62 };

export interface Hosted {
  wallId: string;
  /** The host wall as first recorded: the line the item was drawn against. */
  first: Seg;
  /** Where the item was drawn against the wall as first recorded. */
  originalAt: V;
}

/**
 * The wall a fixture is mounted on, taken from where both were first recorded. An item in a corner belongs,
 * for display, to the wall that was moved since (that is the wall whose move it follows).
 */
export function hostedOn(el: Element, scene: Scene): Hosted | undefined {
  const kind = itemKind(el);
  const reach = kind ? REACH[kind] : undefined;
  if (el.geometry.kind !== "point" || reach === undefined) return undefined;
  const at = el.geometry.at as V;
  let best: { score: number; wall: Element; first: Seg } | undefined;
  for (const w of scene.elements) {
    if (w.type !== "wall") continue;
    const first = segOf(w.history[0]?.geometry) ?? segOf(w.geometry);
    if (!first) continue;
    const d = segDist(at, first.from, first.to) - first.thickness / 2;
    if (d > reach) continue;
    const moved = w.history.some((h) => h.geometry && JSON.stringify(h.geometry) !== JSON.stringify(first));
    const score = d - (moved ? 0.25 : 0);
    if (!best || score < best.score) best = { score, wall: w, first };
  }
  return best ? { wallId: best.wall.id, first: best.first, originalAt: at } : undefined;
}

/**
 * Where to draw a point item: a fixture mounted on a wall goes where that wall goes. `wallGeometry` says
 * where the wall is drawn (the latest record by default, or a crew's belief, or an earlier line).
 */
export function itemAt(el: Element, scene: Scene, wallGeometry: (wall: Element) => Geometry = (w) => w.geometry): V | undefined {
  if (el.geometry.kind !== "point") return undefined;
  const at = el.geometry.at as V;
  const h = hostedOn(el, scene);
  const wall = h && scene.elements.find((e) => e.id === h.wallId);
  const now = wall && segOf(wallGeometry(wall));
  if (!h || !now) return at;
  const [a, b] = [mid(h.first), mid(now)];
  return [at[0] + b[0] - a[0], at[1] + b[1] - a[1]];
}

/** Which way an item faces. A mounted fixture keeps the side of its wall it was recorded on. */
export function itemFrame(el: Element, scene: Scene): WallFrame {
  const at: V = el.geometry.kind === "point" ? (el.geometry.at as V) : [0, 0];
  const h = hostedOn(el, scene);
  if (!h) {
    const f = wallFrame(at, scene);
    if (el.type !== "door") return f;
    // A door opens against the nearer wall: hinge on the side where the open leaf stands closest to one.
    const w = doorWidth(el);
    const others = scene.elements.filter((e) => e.type === "wall" && e.geometry.kind === "segment" && e.id !== f.wallId).map((e) => e.geometry as Seg);
    const leafGap = (side: number) => Math.min(...others.map((g) => segDist(add(add(at, f.dir, (side * w) / 2), f.n, w / 2), g.from, g.to)));
    return leafGap(1) < leafGap(-1) - 1e-6 ? { ...f, dir: [-f.dir[0], -f.dir[1]] } : f;
  }
  const dir = unit(h.first);
  let n: V = [-dir[1], dir[0]];
  if ((at[0] - h.first.from[0]) * n[0] + (at[1] - h.first.from[1]) * n[1] < 0) n = [-n[0], -n[1]];
  return { dir, n, onWall: false, thickness: h.first.thickness };
}

// ---------- One shape per item, for both views ----------

/** A solid part: a rectangle in plan, a box (or an upright cylinder when `round`) in 3D. */
export interface ItemRect {
  c: V;
  dir: V;
  along: number;
  depth: number;
  y0: number;
  h: number;
  round?: boolean;
}
/** A drawn line: on the plan as is, in 3D at height `y` (on the floor or on top of a part). */
export interface ItemLine {
  pts: V[];
  y: number;
  closed?: boolean;
  /** Filled with the line colour on the plan (a socket). */
  solid?: boolean;
}
export interface ItemShape {
  kind: ItemKind;
  rects: ItemRect[];
  lines: ItemLine[];
  /** How far the item reaches from `at` into the room, for placing its tag. */
  reach: number;
  /** Highest point, for placing a 3D tag. */
  top: number;
}

const arc = (c: V, u: V, v: V, a: number, b: number, from: number, to: number, steps = 16): V[] =>
  Array.from({ length: steps + 1 }, (_, i) => {
    const t = from + ((to - from) * i) / steps;
    return [c[0] + u[0] * a * Math.cos(t) + v[0] * b * Math.sin(t), c[1] + u[1] * a * Math.cos(t) + v[1] * b * Math.sin(t)] as V;
  });

/** The shape of a point item drawn at `at`, turned by `frame`. */
export function itemShape(el: Element, at: V, frame: WallFrame): ItemShape | undefined {
  const kind = itemKind(el);
  if (!kind || kind === "window") return undefined;
  const { dir, n } = frame;
  const FLOOR = 0.025;
  switch (kind) {
    case "door": {
      // The leaf standing open at 90 degrees into the room it serves, with its swing.
      const w = doorWidth(el);
      const hinge = add(at, dir, -w / 2);
      return {
        kind,
        rects: [{ c: add(hinge, n, w / 2), dir: n, along: w, depth: SIZE.door.leaf, y0: 0, h: SIZE.door.h }],
        lines: [{ pts: arc(hinge, n, dir, w, w, 0, Math.PI / 2), y: FLOOR }],
        reach: w,
        top: SIZE.door.h,
      };
    }
    case "vanity": {
      const s = SIZE.vanity;
      return {
        kind,
        rects: [{ c: at, dir, along: s.along, depth: s.depth, y0: 0, h: s.h }],
        lines: [{ pts: arc(add(at, n, 0.03), dir, n, 0.19, 0.12, 0, Math.PI * 2, 24), y: s.h + 0.004, closed: true }],
        reach: s.depth / 2,
        top: s.h,
      };
    }
    case "wc": {
      // Cistern against the wall, bowl into the room.
      const s = SIZE.wc;
      const back = -s.depth / 2;
      const bowl = s.depth - s.tank;
      return {
        kind,
        rects: [
          { c: add(at, n, back + s.tank / 2), dir, along: s.along, depth: s.tank, y0: 0, h: s.tankH },
          { c: add(at, n, back + s.tank + bowl / 2), dir, along: s.along - 0.04, depth: bowl, y0: 0, h: s.h, round: true },
        ],
        lines: [],
        reach: s.depth / 2,
        top: s.tankH,
      };
    }
    case "shower": {
      const s = SIZE.shower;
      const k = s.along / 2;
      const corner = (a: number, b: number): V => add(add(at, dir, a * k), n, b * k);
      return {
        kind,
        rects: [{ c: at, dir, along: s.along, depth: s.depth, y0: 0, h: s.h }],
        lines: [
          { pts: [corner(-1, -1), corner(1, 1)], y: s.h + 0.004 },
          { pts: [corner(1, -1), corner(-1, 1)], y: s.h + 0.004 },
        ],
        reach: s.depth / 2,
        top: s.h,
      };
    }
    case "socket": {
      // Half-disc on the wall face (the plan symbol); in 3D also the plate itself at socket height.
      const r = SIZE.socket.r;
      return {
        kind,
        rects: [{ c: add(at, n, 0.02), dir, along: 0.14, depth: 0.04, y0: SIZE.socket.y, h: 0.12 }],
        lines: [{ pts: arc(at, dir, n, r, r, 0, Math.PI, 10), y: FLOOR, closed: true, solid: true }],
        reach: r,
        top: SIZE.socket.y + 0.12,
      };
    }
    case "light": {
      const r = SIZE.light.r;
      const k = r * 0.7;
      return {
        kind,
        rects: [],
        lines: [
          { pts: arc(at, [1, 0], [0, 1], r, r, 0, Math.PI * 2, 24), y: FLOOR, closed: true },
          { pts: [[at[0] - k, at[1] - k], [at[0] + k, at[1] + k]], y: FLOOR },
          { pts: [[at[0] - k, at[1] + k], [at[0] + k, at[1] - k]], y: FLOOR },
        ],
        reach: r,
        top: 0,
      };
    }
    case "finish": {
      // A finish or a choice (floor tile, paint colour): a small diamond tag, not an object in the room.
      const d = SIZE.finish.r;
      return {
        kind,
        rects: [],
        lines: [{ pts: [[at[0], at[1] + d], [at[0] + d, at[1]], [at[0], at[1] - d], [at[0] - d, at[1]]], y: FLOOR, closed: true }],
        reach: d,
        top: 0,
      };
    }
  }
}

/** Corners of a part's footprint, in plan metres. */
export function rectCorners(r: ItemRect): V[] {
  const nn: V = [-r.dir[1], r.dir[0]];
  const p = (a: number, b: number): V => add(add(r.c, r.dir, (a * r.along) / 2), nn, (b * r.depth) / 2);
  return [p(-1, -1), p(1, -1), p(1, 1), p(-1, 1)];
}

/** Outline of a round part's footprint. */
export const rectEllipse = (r: ItemRect): V[] => arc(r.c, r.dir, [-r.dir[1], r.dir[0]], r.along / 2, r.depth / 2, 0, Math.PI * 2, 24);

// ---------- Whose item sits on an earlier line ----------

export interface GhostItem {
  el: Element;
  crewId: string;
  wallId: string;
  /** Where that crew would build it: against the wall's earlier recorded line. */
  at: V;
  frame: WallFrame;
}

/**
 * For each wall with an open ghost: the items mounted on it that belong to a crew still working from the
 * earlier line, placed against that line. One entry per item; both views draw exactly this list.
 */
export function ghostItems(scene: Scene, ghosts: Finding[]): GhostItem[] {
  const out: GhostItem[] = [];
  const seen = new Set<string>();
  for (const f of ghosts) {
    const ghost = f.ghost;
    const line = segOf(ghost?.geometry);
    if (!ghost || !line) continue;
    for (const crewId of f.crewIds) {
      const trade = scene.crews.find((c) => c.id === crewId)?.trade;
      if (!trade) continue;
      for (const el of scene.elements) {
        if (seen.has(el.id) || itemTrade(el) !== trade) continue;
        const h = hostedOn(el, scene);
        if (!h || h.wallId !== ghost.elementId) continue;
        const [a, b] = [mid(h.first), mid(line)];
        seen.add(el.id);
        out.push({ el, crewId, wallId: h.wallId, at: [h.originalAt[0] + b[0] - a[0], h.originalAt[1] + b[1] - a[1]], frame: itemFrame(el, scene) });
      }
    }
  }
  return out;
}
