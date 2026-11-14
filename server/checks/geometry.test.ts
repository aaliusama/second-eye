import { describe, expect, it } from "vitest";
import type { Point } from "@site/contracts";
import {
  clipHalfPlane,
  compass,
  convexHull,
  intersectConvex,
  isConvex,
  polygonArea,
  sideTowards,
  signedArea,
  strip,
  wallFace,
  wallRect,
} from "./geometry";

// Owner: B. Plane geometry used by the measured checks.

const rect = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
const seg = (from: Point, to: Point, thickness = 0.12) => ({ kind: "segment" as const, from, to, thickness });

describe("plane geometry", () => {
  it("area: shoelace, sign follows orientation", () => {
    expect(signedArea(rect(0, 0, 5, 8))).toBe(40);
    expect(signedArea([...rect(0, 0, 5, 8)].reverse())).toBe(-40);
    expect(polygonArea([[0, 0], [4, 0], [0, 3]])).toBe(6);
  });

  it("convexHull: drops inner and collinear points, CCW", () => {
    const hull = convexHull([[0, 0], [2, 0], [4, 0], [4, 4], [2, 2], [0, 4]]);
    expect(hull).toEqual([[0, 0], [4, 0], [4, 4], [0, 4]]);
    expect(signedArea(hull)).toBeGreaterThan(0);
    expect(convexHull([[0, 0], [1, 1], [2, 2]])).toEqual([]); // no area
  });

  it("isConvex: rectangle yes, L-shape no", () => {
    expect(isConvex(rect(0, 0, 5, 8))).toBe(true);
    expect(isConvex([...rect(0, 0, 5, 8)].reverse())).toBe(true);
    expect(isConvex([[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]])).toBe(false);
  });

  it("clipHalfPlane splits a room along a wall line", () => {
    const west = clipHalfPlane(rect(15, 2, 20, 10), [18, 2], [-1, 0]);
    expect(polygonArea(west)).toBeCloseTo(24);
    const east = clipHalfPlane(rect(15, 2, 20, 10), [18, 2], [1, 0]);
    expect(polygonArea(east)).toBeCloseTo(16);
  });

  it("intersectConvex: overlap, containment, touching edges and disjoint", () => {
    expect(polygonArea(intersectConvex(rect(0, 0, 4, 4), rect(2, 2, 6, 6)))).toBeCloseTo(4);
    expect(polygonArea(intersectConvex(rect(1, 1, 2, 2), rect(0, 0, 4, 4)))).toBeCloseTo(1);
    // Clip orientation does not matter.
    expect(polygonArea(intersectConvex(rect(0, 0, 4, 4), [...rect(2, 2, 6, 6)].reverse()))).toBeCloseTo(4);
    // Neighbouring rooms share an edge only: no area, no intersection.
    expect(intersectConvex(rect(10, 2, 15, 10), rect(15, 2, 20, 10))).toEqual([]);
    expect(intersectConvex(rect(0, 0, 1, 1), rect(3, 3, 4, 4))).toEqual([]);
  });

  it("intersectConvex: non-convex SUBJECT is fine, the clip must be convex (stated assumption)", () => {
    const L: Point[] = [[0, 0], [4, 0], [4, 2], [2, 2], [2, 4], [0, 4]]; // area 12
    // L as subject against a convex square: exact (the L's notch [2,4]x[2,4] lies outside the result).
    expect(polygonArea(intersectConvex(L, rect(1, 1, 3, 3)))).toBeCloseTo(3);
    // L as the clip breaks the assumption: the area comes out wrong (1, not 3). Callers hull non-convex shapes first.
    const wrong = polygonArea(intersectConvex(rect(1, 1, 3, 3), L));
    expect(wrong).not.toBeCloseTo(3);
    expect(polygonArea(intersectConvex(rect(1, 1, 3, 3), convexHull(L)))).toBeGreaterThanOrEqual(3);
  });

  it("wall faces, rectangle and strip", () => {
    const w = seg([18, 2], [18, 5]);
    expect(wallFace(w, [-1, 0])).toEqual([[17.94, 2], [17.94, 5]]);
    expect(wallFace(w, [1, 0])).toEqual([[18.06, 2], [18.06, 5]]);
    expect(polygonArea(wallRect(w))).toBeCloseTo(0.36);
    expect(polygonArea(strip(wallFace(w, [-1, 0]), [-1, 0], 0.6))).toBeCloseTo(1.8);
  });

  it("sideTowards: the side holding more of the place; undefined on a tie", () => {
    expect(sideTowards(seg([18, 2], [18, 5]), rect(15, 2, 20, 10))).toEqual([-1, 0]); // 24 m² west vs 16 east
    expect(sideTowards(seg([5, 2], [10, 2], 0.2), rect(5, 2, 10, 10))![1]).toBeCloseTo(1); // room is north
    expect(sideTowards(seg([25, 6], [28, 6]), rect(25, 2, 30, 10))).toBeUndefined(); // 20 vs 20
    expect(sideTowards(seg([18, 2], [18, 5]), [])).toBeUndefined();
  });

  it("compass: dominant axis", () => {
    expect(compass([0.4, 0])).toBe("east");
    expect(compass([-0.1, 0.3])).toBe("north");
    expect(compass([0, -1])).toBe("south");
    expect(compass([-1, 1])).toBe("west"); // tie: east/west
  });
});
