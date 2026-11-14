import type { Element, ElementType, Geometry, Point, Scene } from "@site/contracts";
import { doorWidth, itemKind, wallFrame, type ItemRect, type V } from "../planSymbols";

// Owner: H. Plan coordinates (x east, y north, metres) -> world solids.
// World axes: x east, y up, z south. A plan point (x, y) sits at world (x, 0, -y).
// The view root group is offset by the floor centre, so children stay in plan metres.

export const WALL_HEIGHT = 1.2;
const SLAB = { room: 0.02, zone: 0.012 } as const;
const MARKER = { door: 0.9, window: 0.9, fixture: 0.5 } as const;

/** A box (walls, markers) or an extruded plan polygon (rooms, zones). */
export type Solid =
  | { kind: "box"; center: [number, number, number]; size: [number, number, number]; rotY: number }
  | { kind: "slab"; points: Point[]; height: number; center: [number, number, number] };

/** Walls are cut at WALL_HEIGHT whatever their real height, so rooms read from above (a cut-away model). */
export function heightFor(type: ElementType, given?: number): number {
  if (type === "wall") return Math.min(given ?? WALL_HEIGHT, WALL_HEIGHT);
  if (given !== undefined) return given;
  if (type === "room" || type === "zone") return SLAB[type];
  return MARKER[type];
}

/** The solid for a geometry, as an element of `type` would be drawn. */
export function solidFor(g: Geometry, type: ElementType, height?: number): Solid {
  const h = heightFor(type, height);
  if (g.kind === "segment") {
    const dx = g.to[0] - g.from[0];
    const dy = g.to[1] - g.from[1];
    const len = Math.max(Math.hypot(dx, dy), 0.01);
    const mx = (g.from[0] + g.to[0]) / 2;
    const my = (g.from[1] + g.to[1]) / 2;
    const sh = type === "wall" ? h : Math.min(h, 0.3);
    return { kind: "box", center: [mx, sh / 2, -my], size: [len, sh, g.thickness], rotY: Math.atan2(dy, dx) };
  }
  if (g.kind === "point") {
    const s = type === "fixture" ? 0.45 : 0.25;
    return { kind: "box", center: [g.at[0], h / 2, -g.at[1]], size: [s, h, s], rotY: 0 };
  }
  const n = g.points.length;
  const cx = g.points.reduce((a, p) => a + p[0], 0) / n;
  const cy = g.points.reduce((a, p) => a + p[1], 0) / n;
  return { kind: "slab", points: g.points, height: h, center: [cx, h, -cy] };
}

/**
 * The solid for an element. Doors and fixtures are not single solids: the model draws their shared shape
 * (planSymbols.ts), the same one the flat plan draws. This box is their marker for bounds and framing.
 */
export function elementSolid(e: Element, _scene?: Scene): Solid {
  const g = e.geometry;
  if (itemKind(e) === "window" && g.kind === "segment") {
    // Glazing band from the sill (0.9 m) to the cut, a little proud of the facade so it reads in the wall.
    const dx = g.to[0] - g.from[0];
    const dy = g.to[1] - g.from[1];
    const h = WALL_HEIGHT - 0.9 + 0.02;
    return { kind: "box", center: [(g.from[0] + g.to[0]) / 2, 0.9 + h / 2, -(g.from[1] + g.to[1]) / 2], size: [Math.hypot(dx, dy), h, g.thickness + 0.06], rotY: Math.atan2(dy, dx) };
  }
  return solidFor(g, e.type, e.height);
}

/** A part of an item's shared shape as a world box (or the box around an upright cylinder). */
export function rectSolid(r: ItemRect): Solid & { kind: "box" } {
  return { kind: "box", center: [r.c[0], r.y0 + r.h / 2, -r.c[1]], size: [r.along, r.h, r.depth], rotY: Math.atan2(r.dir[1], r.dir[0]) };
}

/** A plan polyline at height y, in world coordinates. */
export const planLine = (pts: V[], y: number, closed = false): [number, number, number][] => {
  const out = pts.map((p) => [p[0], y, -p[1]] as [number, number, number]);
  return closed && out.length ? [...out, out[0]!] : out;
};

/**
 * A wall as it stands with its door openings cut out: the same opening the flat plan cuts from the wall line.
 * Returns the wall's geometry in pieces (one piece when no door stands in it).
 */
export function wallPieces(wall: Element, scene: Scene): Geometry[] {
  const g = wall.geometry;
  if (wall.type !== "wall" || g.kind !== "segment") return [g];
  const len = Math.hypot(g.to[0] - g.from[0], g.to[1] - g.from[1]);
  if (len < 0.01) return [g];
  const u: V = [(g.to[0] - g.from[0]) / len, (g.to[1] - g.from[1]) / len];
  const cuts = scene.elements
    .filter((d) => d.type === "door" && d.geometry.kind === "point")
    .map((d) => ({ d, at: (d.geometry as { at: V }).at }))
    .filter(({ at }) => wallFrame(at, scene).wallId === wall.id)
    .map(({ d, at }) => {
      const t = (at[0] - g.from[0]) * u[0] + (at[1] - g.from[1]) * u[1];
      return [Math.max(0, t - doorWidth(d) / 2), Math.min(len, t + doorWidth(d) / 2)] as [number, number];
    })
    .sort((a, b) => a[0] - b[0]);
  if (cuts.length === 0) return [g];
  const pieces: Geometry[] = [];
  let from = 0;
  const piece = (a: number, b: number) => {
    if (b - a > 0.02) pieces.push({ ...g, from: [g.from[0] + u[0] * a, g.from[1] + u[1] * a], to: [g.from[0] + u[0] * b, g.from[1] + u[1] * b] });
  };
  for (const [a, b] of cuts) {
    piece(from, a);
    from = Math.max(from, b);
  }
  piece(from, len);
  return pieces;
}

/** Axis-aligned world bounds of a solid: [minX, minY, minZ, maxX, maxY, maxZ]. */
export function solidBounds(s: Solid): [number, number, number, number, number, number] {
  if (s.kind === "slab") {
    const xs = s.points.map((p) => p[0]);
    const zs = s.points.map((p) => -p[1]);
    return [Math.min(...xs), 0, Math.min(...zs), Math.max(...xs), s.height, Math.max(...zs)];
  }
  const [cx, cy, cz] = s.center;
  const [sx, sy, sz] = s.size;
  const c = Math.abs(Math.cos(s.rotY));
  const n = Math.abs(Math.sin(s.rotY));
  const hx = (sx * c + sz * n) / 2;
  const hz = (sx * n + sz * c) / 2;
  return [cx - hx, cy - sy / 2, cz - hz, cx + hx, cy + sy / 2, cz + hz];
}

/** Plan bounds of the whole scene, in plan metres. */
export function planBounds(scene: Scene): { minX: number; minY: number; maxX: number; maxY: number } {
  const pts: Point[] = scene.elements.flatMap((e) =>
    e.geometry.kind === "segment" ? [e.geometry.from, e.geometry.to] : e.geometry.kind === "point" ? [e.geometry.at] : e.geometry.points,
  );
  if (pts.length === 0) return { minX: 0, minY: 0, maxX: 10, maxY: 10 };
  return {
    minX: Math.min(...pts.map((p) => p[0])),
    minY: Math.min(...pts.map((p) => p[1])),
    maxX: Math.max(...pts.map((p) => p[0])),
    maxY: Math.max(...pts.map((p) => p[1])),
  };
}

/** The 12 edges of a box centred at the origin, as point pairs (for drei Line segments). */
export function boxEdges(size: [number, number, number]): [number, number, number][] {
  const [x, y, z] = size.map((v) => v / 2) as [number, number, number];
  const c: [number, number, number][] = [
    [-x, -y, -z], [x, -y, -z], [x, -y, z], [-x, -y, z],
    [-x, y, -z], [x, y, -z], [x, y, z], [-x, y, z],
  ];
  const pairs = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return pairs.flatMap(([a, b]) => [c[a]!, c[b]!]);
}

/** Outline of a slab polygon at its top, in world coordinates, closed. */
export function slabOutline(points: Point[], y: number): [number, number, number][] {
  const ring = points.map((p) => [p[0], y, -p[1]] as [number, number, number]);
  return [...ring, ring[0]!];
}
