/** Conservative error-family classification. Never retain messages, SQL or parameters. */
export const DB_FAILURE_FAMILIES = ["timeout", "constraint", "conflict", "connection", "other", "unknown"] as const;
export type DbFailureFamily = (typeof DB_FAILURE_FAMILIES)[number];

type StructuredDbError = {
  code?: unknown;
  sqlState?: unknown;
  sqlstate?: unknown;
  cause?: unknown;
  meta?: unknown;
  driverAdapterError?: unknown;
  originalError?: unknown;
};

function structuredCodes(error: unknown): string[] {
  const codes: string[] = [];
  const pending: unknown[] = [error];
  const visited = new Set<unknown>();
  for (let depth = 0; depth < 4 && pending.length; depth += 1) {
    const level = pending.splice(0);
    for (const item of level) {
      if (!item || typeof item !== "object" || visited.has(item)) continue;
      visited.add(item);
      const value = item as StructuredDbError;
      for (const candidate of [value.sqlState, value.sqlstate, value.code]) {
        if (typeof candidate === "string" && /^[A-Z0-9]{4,8}$/.test(candidate)) codes.push(candidate);
      }
      pending.push(value.cause, value.meta, value.driverAdapterError, value.originalError);
    }
  }
  return codes;
}

export function classifyDbFailure(error: unknown): DbFailureFamily {
  const codes = structuredCodes(error);
  if (codes.length === 0) return "unknown";
  // Prefer the most specific structured signal across ORM wrapper causes.
  if (codes.some((code) => code === "57014" || code === "55P03" || code === "P1008" || code === "P2024")) return "timeout";
  if (codes.some((code) => code.startsWith("23") || ["P2002", "P2003", "P2004", "P2011"].includes(code))) return "constraint";
  if (codes.some((code) => code === "40001" || code === "40P01" || code === "P2034")) return "conflict";
  if (codes.some((code) => code.startsWith("08") || ["P1001", "P1002", "P1017"].includes(code))) return "connection";
  return "other";
}
