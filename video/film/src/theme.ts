// Brand tokens copied from web/src/tokens.ts so the film and the product share one language.
// Redline is the ghost's colour only, in the film as in the app.
import { Easing } from "remotion";

export const color = {
  paper: "#EEF1F2",
  paperRule: "#D9DFE2",
  surface: "#FFFFFF",
  ink: "#1C2B3A",
  inkSoft: "#526575",
  redline: "#D4281C",
  clear: "#1F8A4C",
  pending: "#E0A100",
} as const;

export const FONT = "'Archivo Film', 'Archivo Variable', sans-serif";
export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** Camera moves: a slow, weighted in-out. Arrivals: a quick expo-out. No bounce anywhere. */
export const ease = {
  camera: Easing.bezier(0.65, 0, 0.35, 1),
  arrive: Easing.bezier(0.16, 1, 0.3, 1),
  leave: Easing.bezier(0.7, 0, 0.84, 0),
};

export const sec = (s: number) => Math.round(s * FPS);
