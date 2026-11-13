import type { Element, Finding, Geometry, Scene } from "@site/contracts";
import { color } from "./tokens";

// Owner: D. Bare top-down SVG view. Drafting conventions per state come next (web/AGENTS.md).
// Plan y points north, SVG y points down, so the group is flipped.

function points(g: Geometry): [number, number][] {
  if (g.kind === "segment") return [g.from, g.to];
  if (g.kind === "polygon") return g.points;
  return [g.at];
}

function Shape({ g, stroke, dashed }: { g: Geometry; stroke: string; dashed?: boolean }) {
  const dash = dashed ? "0.3 0.2" : undefined;
  if (g.kind === "segment") {
    return (
      <line x1={g.from[0]} y1={g.from[1]} x2={g.to[0]} y2={g.to[1]} stroke={stroke} strokeWidth={g.thickness} strokeDasharray={dash} />
    );
  }
  if (g.kind === "polygon") {
    return <polygon points={g.points.map((p) => p.join(",")).join(" ")} fill="none" stroke={stroke} strokeWidth={0.05} strokeDasharray={dash} />;
  }
  return <circle cx={g.at[0]} cy={g.at[1]} r={0.15} fill={stroke} />;
}

export function FlatView({ scene, findings }: { scene: Scene; findings: Finding[] }) {
  const all = scene.elements.flatMap((e: Element) => points(e.geometry));
  if (all.length === 0) return <p>No elements in the record.</p>;
  const xs = all.map((p) => p[0]);
  const ys = all.map((p) => p[1]);
  const pad = 1;
  const minX = Math.min(...xs) - pad;
  const maxX = Math.max(...xs) + pad;
  const minY = Math.min(...ys) - pad;
  const maxY = Math.max(...ys) + pad;

  return (
    <svg viewBox={`${minX} ${-maxY} ${maxX - minX} ${maxY - minY}`} role="img" aria-label={scene.name}>
      <g transform="scale(1,-1)">
        {scene.elements.map((e) => (
          <Shape key={e.id} g={e.geometry} stroke={e.type === "wall" ? color.ink : color.inkSoft} />
        ))}
        {findings.flatMap((f) => (f.ghost ? [<Shape key={f.id} g={f.ghost.geometry} stroke={color.redline} dashed />] : []))}
      </g>
    </svg>
  );
}
