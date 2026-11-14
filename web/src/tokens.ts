// Owner: D. The only place colours, type, sizes and timings are defined (web/AGENTS.md).
// CSS reads them as variables (applyTokens); TS reads them directly. Never hard-code elsewhere.

export const color = {
  paper: "#EEF1F2",
  /** A shade of paper for the drafting grid and quiet panel rules. */
  paperRule: "#D9DFE2",
  surface: "#FFFFFF",
  ink: "#1C2B3A",
  inkSoft: "#526575",
  /** Ghost and conflict ONLY. Never for buttons, badges or branding. */
  redline: "#D4281C",
  /** A check that passed, a clash that was fixed. */
  clear: "#1F8A4C",
  /** Proposed or unconfirmed. */
  pending: "#E0A100",
} as const;

/** One muted set for crews. The letter badge must be enough without the colour. */
export const crewHues = ["#4F6D8A", "#7A6A4F", "#5E7D63", "#7D5E78", "#8A6B4F", "#5C6F7A"] as const;

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
  captionHeight: "88px",
  controlHeight: "36px",
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
  root.style.setProperty("--font", font.family);
  root.style.setProperty("--condensed", font.condensed);
  root.style.setProperty("--answer", `${motion.answer}ms`);
}
