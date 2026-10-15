/**
 * These are the only free-form strings retained from privileged diagnostics.
 * Numeric metrics and V8 space names are separately projected by the
 * corresponding analyzers. Never persist API-provided arbitrary text.
 */
export function safeCommit(value) {
  return typeof value === "string" && /^[a-f0-9]{7,40}$/i.test(value)
    ? value.toLowerCase() : null;
}

export function safeVersion(value) {
  return typeof value === "string" &&
    /^\d{1,4}\.\d{1,4}\.\d{1,6}(?:[-+][a-zA-Z0-9._-]{1,24})?$/.test(value)
    ? value : null;
}

export function safeStoreId(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,64}$/.test(value)
    ? value : null;
}

export function safeTimestamp(value) {
  if (typeof value !== "string" || value.length > 40) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
}
