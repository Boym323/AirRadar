/**
 * Strict CI-only acceptance check for a user-consented YouTube-nocookie iframe.
 * Both V6-H browser scenarios use the same complete security contract instead
 * of comparing query parameter order or trusting a startsWith prefix.
 */
export function isAuthorizedYouTubeFrame(value, expectedVideoId) {
  if (typeof value !== "string" || typeof expectedVideoId !== "string" ||
      !/^[A-Za-z0-9_-]{11}$/.test(expectedVideoId)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" &&
      url.hostname === "www.youtube-nocookie.com" &&
      !url.username && !url.password && !url.port && !url.hash &&
      url.pathname === `/embed/${expectedVideoId}` &&
      url.searchParams.size === 2 &&
      url.searchParams.get("controls") === "1" &&
      url.searchParams.get("playsinline") === "1";
  } catch {
    return false;
  }
}
