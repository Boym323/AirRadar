/**
 * Bounded HTTP transport for T58. Never log arbitrary response bodies,
 * request headers, token, URL, IP address or underlying exception text.
 */
const ENDPOINTS = Object.freeze({
  status: "/api/system/status",
  runtime: "/api/system/runtime-performance",
});
const SAFE_HTTP_STATUSES = new Set([401, 403, 408, 429, 500, 502, 503, 504]);

export async function fetchCpuSpikeDiagnostic(base, cookie, kind, fetchImpl = fetch) {
  if (!Object.hasOwn(ENDPOINTS, kind)) throw Error("t58_spike_invalid_endpoint");
  const response = await fetchImpl(new URL(ENDPOINTS[kind], base), {
    ...(cookie ? { headers: { Cookie: cookie } } : {}),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response?.ok) {
    const code = SAFE_HTTP_STATUSES.has(response?.status) ? String(response.status) : "other";
    throw Error("t58_spike_" + kind + "_http_" + code);
  }
  try {
    return await response.json();
  } catch {
    throw Error("t58_spike_" + kind + "_invalid_response");
  }
}
