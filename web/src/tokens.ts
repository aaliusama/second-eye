// Owner: D. The only place colours, type, sizes and timings are defined (web/AGENTS.md).
// CSS reads them as variables (applyTokens); TS reads them directly. Never hard-code elsewhere.

export const color = {
  /** The command-center floor: near-black blue, so the drawing and the ghost carry the light. */
  paper: "#090D16",
  /** Quiet rules on dark: hairlines, the drafting grid, panel borders. */
  paperRule: "rgba(255,255,255,0.08)",
  /** Drafting grid on the plan canvas only, about 4% white. */
  gridLine: "rgba(255,255,255,0.04)",
  /** First surface step above the floor (side panel, header, bars). */
  surface: "#0F1522",
  /** Second surface step: raised controls and hovered rows. */
  surfaceRaised: "#151C2B",
  ink: "#E6EAF0",
  inkSoft: "#94A3B8",
  /** Ghost and conflict ONLY. Never for buttons, badges or branding. */
  redline: "#EF4444",
  /** A check that passed, a clash that was fixed. */
  clear: "#10B981",
  /** Proposed or unconfirmed. */
  pending: "#F59E0B",
  /** Floating HUD panels over the canvas (slider, lens switch). */
  hudBg: "rgba(15,23,42,0.8)",
  hudBorder: "rgba(255,255,255,0.1)",
  /** Strong rule where a hairline must still read (selected rows, header). */
  ruleStrong: "rgba(255,255,255,0.12)",
} as const;

/** 3D scene colours on the dark floor. Matte slate walls so ink edges and the redline ghost pop. */
export const scene3d = {
  sky: "#C8D2E0",
  groundLight: "#1A2333",
  wall: "#1C2638",
  slab: "#121A29",
  built: "#4A5A72",
  shadow: "#000000",
  gridCell: "#243044",
  gridSection: "#3A4A63",
} as const;

/** One set for crews, lightened to read on the dark floor. The letter badge must be enough without the colour. */
export const crewHues = ["#7FA6CC", "#C9A86E", "#86BF8F", "#C08CBA", "#D49A6A", "#86A9B8"] as const;

export const font = {
  family: "'Archivo Variable', sans-serif",
  /** Labels inside the drawing. */
  condensed: "72%",
  normal: "100%",
} as const;

export const size = {
  text: "14px",
  small: "12px",
  heading: "17px",
  title: "20px",
  rule: "1px",
  radius: "5px",
  gap: "12px",
  pad: "20px",
  queueWidth: "380px",
  display: "28px",
  captionHeight: "112px",
  controlHeight: "36px",
  /** Floating sheets (tools, inspector, phone) sit one step above the drawing. */
  radiusLarge: "6px",
  /** One sub-row of a crew lane on the timeline; a lane grows when that crew's bars overlap. */
  laneRow: "22px",
} as const;

/**
 * Surface depth. Two steps only, ink-tinted, never grey fog: a hairline ring plus a short contact
 * shadow reads as paper lifted off the table, not a SaaS card.
 */
export const depth = {
  ring: "0 0 0 1px rgba(255,255,255,0.08)",
  lift: "0 0 0 1px rgba(255,255,255,0.08), 0 1px 2px rgb(0 0 0 / 0.35), 0 4px 12px -4px rgb(0 0 0 / 0.5)",
  float: "0 0 0 1px rgba(255,255,255,0.10), 0 2px 4px rgb(0 0 0 / 0.3), 0 12px 32px -8px rgb(0 0 0 / 0.6)",
  /** Top highlight on raised controls so they read as pressed, not a flat rectangle. */
  inkHighlight: "inset 0 1px 0 rgb(255 255 255 / 0.10)",
  /** The drafting dot field behind the plan. */
  dot: "rgba(255,255,255,0.07)",
  dotStep: "16px",
  /** Big soft shadow under floating HUD panels. */
  hud: "0 0 0 1px rgba(255,255,255,0.06), 0 8px 24px -6px rgb(0 0 0 / 0.55), 0 24px 64px -12px rgb(0 0 0 / 0.65)",
  /** Faint redline glow for conflict emphasis on dark. */
  glow: "0 0 0 1px rgb(239 68 68 / 0.5), 0 0 18px -2px rgb(239 68 68 / 0.45)",
  /** Backdrop blur for HUD glass. */
  blur: "12px",
} as const;

/** Drawing units are metres. Line weights in metres at plan scale. */
export const drawing = {
  hairline: 0.03,
  outline: 0.06,
  heavy: 0.1,
  gridStep: 5,
  bubbleRadius: 0.55,
  labelSize: 0.55,
  smallLabel: 0.4,
  ghostOpacity: 0.18,
  /** Hatch spacing and line weight for measured zones (work zone strip, overlap of a space clash). */
  hatchStep: 0.28,
  hatchWidth: 0.035,
  /** Timeline arrows (px): arrow head size, normal and emphasised line weights. */
  arrowHead: 5,
  arrowLine: 1.25,
  arrowCritical: 2.25,
} as const;

/** Motion budget: the ghost reveal, plus 150-250 ms answers to user actions. */
export const motion = {
  frame: 600,
  drawTrue: 300,
  grow: 500,
  dimension: 250,
  answer: 180,
} as const;

/** Writes the tokens as CSS variables (--paper, --ink, ...) so CSS and TS share one source. */
export function applyTokens(root: HTMLElement): void {
  const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  for (const [name, value] of Object.entries(color)) root.style.setProperty(`--${kebab(name)}`, value);
  for (const [name, value] of Object.entries(size)) root.style.setProperty(`--${kebab(name)}`, value);
  for (const [name, value] of Object.entries(depth)) root.style.setProperty(`--depth-${kebab(name)}`, value);
  root.style.setProperty("--ease-out", "cubic-bezier(0.2, 0.8, 0.2, 1)");
  root.style.setProperty("--font", font.family);
  root.style.setProperty("--condensed", font.condensed);
  root.style.setProperty("--answer", `${motion.answer}ms`);
}
