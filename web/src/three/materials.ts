import { BoxGeometry, Color, MeshBasicMaterial, MeshStandardMaterial, ShadowMaterial } from "three";
import type { ElementState } from "@site/contracts";
import { color, scene3d } from "../tokens";

// Owner: H. Every geometry and material the 3D view shares, created once (web/AGENTS.md 3D rules).
// Colours only from tokens.ts. Surfaces are matte; the drawing lives in the edges.

/** Unit box, scaled per wall or marker. Never disposed: it lives for the page. */
export const unitBox = new BoxGeometry(1, 1, 1);

const matte = (hex: string, opacity = 1) =>
  new MeshStandardMaterial({
    color: new Color(hex),
    roughness: 0.92,
    metalness: 0,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1,
  });

/** Fill per element state. Built is the only filled ink; planned is barely there. */
export const fillByState: Record<ElementState, MeshStandardMaterial> = {
  planned: matte(scene3d.wall, 0.35),
  proposed: matte(color.pending, 0.18),
  approved: matte(scene3d.wall),
  built: matte(scene3d.built),
  unconfirmed: matte(color.pending, 0.32),
  conflict: matte(scene3d.wall),
};

/** Floor slabs read as a dark slab on the dark floor; state shows in the outline. */
export const slabByState: Record<ElementState, MeshStandardMaterial> = {
  planned: matte(scene3d.slab, 0.5),
  proposed: matte(color.pending, 0.12),
  approved: matte(scene3d.slab),
  built: matte(color.inkSoft, 0.22),
  unconfirmed: matte(color.pending, 0.22),
  conflict: matte(color.redline, 0.08),
};

export interface EdgeStyle {
  color: string;
  dashed: boolean;
  width: number;
}

/** Drafting conventions from web/AGENTS.md, in 3D: shape as well as colour. */
export const edgeByState: Record<ElementState, EdgeStyle> = {
  planned: { color: color.inkSoft, dashed: false, width: 1 },
  proposed: { color: color.pending, dashed: true, width: 1.5 },
  approved: { color: color.ink, dashed: false, width: 1.25 },
  built: { color: color.ink, dashed: false, width: 1.5 },
  unconfirmed: { color: color.pending, dashed: false, width: 1.5 },
  conflict: { color: color.redline, dashed: false, width: 2 },
};

/** Static ghosts. */
export const ghostFill = new MeshBasicMaterial({ color: new Color(color.redline), transparent: true, opacity: 0.22, depthWrite: false });
/** The ghost being revealed; its opacity is animated, so it is separate from the static one. */
export const ghostRevealFill = new MeshBasicMaterial({ color: new Color(color.redline), transparent: true, opacity: 0, depthWrite: false });

/** Receives the key light's shadow on the paper ground. */
export const groundShadow = new ShadowMaterial({ color: new Color(scene3d.shadow), opacity: 0.45 });

export { color };
