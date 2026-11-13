import type { Element, ElementType, Geometry, Point, Scene } from "@site/contracts";

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

export function elementSolid(e: Element): Solid {
  return solidFor(e.geometry, e.type, e.height);
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
