/** One JSON line per event, so the timeline is debuggable (AGENTS.md). */
export function logLine(record: { kind: string } & Record<string, unknown>): void {
  process.stdout.write(JSON.stringify(record) + "\n");
}

const warned = new Set<string>();

/** Log a stub or fallback once, not on every request. */
export function warnOnce(kind: string, message: string): void {
  if (warned.has(kind)) return;
  warned.add(kind);
  logLine({ kind, message });
}
