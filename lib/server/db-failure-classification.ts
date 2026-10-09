/** Conservative error-family classification. Never retain messages, SQL or parameters. */
export const DB_FAILURE_FAMILIES = ["timeout", "constraint", "conflict", "connection", "other", "unknown"] as const;
export type DbFailureFamily = (typeof DB_FAILURE_FAMILIES)[number];

export function classifyDbFailure(error: unknown): DbFailureFamily {
  if (!error || typeof error !== "object") return "unknown";
  const candidate = error as { code?: unknown; sqlstate?: unknown };
  const code = typeof candidate.sqlstate === "string" ? candidate.sqlstate
    : typeof candidate.code === "string" ? candidate.code : "";
  if (!/^[A-Z0-9]{4,8}$/.test(code)) return "unknown";
  // SQLSTATE classes and known Prisma codes; preserve ambiguous errors as other.
  if (code === "57014" || code === "55P03" || code === "P1008" || code === "P2024") return "timeout";
  if (code.startsWith("23") || ["P2002", "P2003", "P2004", "P2011"].includes(code)) return "constraint";
  if (code === "40001" || code === "40P01" || code === "P2034") return "conflict";
  if (code.startsWith("08") || ["P1001", "P1002", "P1017"].includes(code)) return "connection";
  return "other";
}
