// Owner: D. The only place colours and type are defined (web/AGENTS.md). Values are the guide's proposal.

export const color = {
  paper: "#EEF1F2",
  ink: "#1C2B3A",
  inkSoft: "#6B7A88",
  /** Ghost and conflict ONLY. */
  redline: "#D4281C",
  clear: "#1F8A4C",
  pending: "#E0A100",
} as const;

export const font = {
  family: "'Archivo Variable', system-ui, sans-serif",
} as const;

/** Writes the tokens as CSS variables (--paper, --ink, ...) so CSS and TS share one source. */
export function applyTokens(root: HTMLElement): void {
  const kebab = (s: string) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  for (const [name, value] of Object.entries(color)) root.style.setProperty(`--${kebab(name)}`, value);
  root.style.setProperty("--font", font.family);
}
