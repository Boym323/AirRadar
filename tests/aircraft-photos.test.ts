import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as getAircraftPhotoRoute } from "@/app/api/aircraft/[hex]/photo/route";
import { getTranslations } from "@/lib/i18n";
import {
  AIRCRAFT_PHOTO_USER_AGENT,
  AircraftPhotoCache,
  defaultPlanespottersPhotoProvider,
  PlanespottersPhotoProvider,
} from "@/lib/server/aircraft-photo-provider";

vi.mock("@/lib/server/db", () => ({ getPrisma: vi.fn(() => null) }));

const photoPayload = {
  photos: [{
    thumbnail: { src: "https://t.plnspttrs.net/123/photo_thumb.jpg" },
    link: "https://www.planespotters.net/photo/123/example?utm_source=api",
    photographer: "Jane Photographer",
  }],
};

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function provider(fetcher: typeof fetch, options: { cache?: AircraftPhotoCache; timeoutMs?: number } = {}) {
  return new PlanespottersPhotoProvider({ fetcher, ...options });
}

afterEach(() => {
  defaultPlanespottersPhotoProvider.clearCache();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("AIRCRAFT PHOTOS V1 provider", () => {
  it("normalizes a valid lowercase hex before the hex lookup", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ photos: [] }));
    await provider(fetcher).getPhoto("abc123");

    expect(fetcher).toHaveBeenCalledWith(
      "https://api.planespotters.net/pub/photos/hex/ABC123",
      expect.objectContaining({ headers: { Accept: "application/json", "User-Agent": AIRCRAFT_PHOTO_USER_AGENT } }),
    );
  });

  it("uses registration only as a fallback after an empty hex response", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ photos: [] }, 404))
      .mockResolvedValueOnce(jsonResponse(photoPayload));

    const result = await provider(fetcher).getPhoto("ABC123", "OK-ABC");

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual([
      "https://api.planespotters.net/pub/photos/hex/ABC123",
      "https://api.planespotters.net/pub/photos/reg/OK-ABC",
    ]);
    expect(result.photo).toMatchObject({
      thumbnailUrl: "https://t.plnspttrs.net/123/photo_thumb.jpg",
      sourceUrl: "https://www.planespotters.net/photo/123/example?utm_source=api",
      photographer: "Jane Photographer",
      attribution: "© Jane Photographer",
      provider: "planespotters",
    });
  });

  it("does not perform a callsign lookup when no registration metadata exists", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse({ photos: [] }));
    await provider(fetcher).getPhoto("ABC123");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe("https://api.planespotters.net/pub/photos/hex/ABC123");
  });

  it("returns null for not found, 403, 429, 5xx, malformed JSON and timeout", async () => {
    const statuses = [404, 403, 429, 500, 503];
    for (const [index, status] of statuses.entries()) {
      const fetcher = vi.fn().mockResolvedValue(jsonResponse({ error: "upstream" }, status));
      await expect(provider(fetcher).getPhoto(`ABC${String(index).padStart(3, "0")}`)).resolves.toMatchObject({ photo: null });
    }

    const malformed = vi.fn().mockResolvedValue(new Response("{bad json", { status: 200 }));
    await expect(provider(malformed).getPhoto("BAD001")).resolves.toMatchObject({ photo: null });

    const timeoutFetcher = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
    }));
    await expect(provider(timeoutFetcher, { timeoutMs: 5 }).getPhoto("BAD002")).resolves.toMatchObject({ photo: null });
  });

  it("rejects HTTP and non-Planespotters image URLs", async () => {
    const disallowed = vi.fn().mockResolvedValue(jsonResponse({ photos: [{
      thumbnail: { src: "https://images.example.invalid/photo.jpg" },
      link: "https://www.planespotters.net/photo/123/example",
      photographer: "Jane Photographer",
    }] }));
    await expect(provider(disallowed).getPhoto("5EC001")).resolves.toMatchObject({ photo: null });

    const http = vi.fn().mockResolvedValue(jsonResponse({ photos: [{
      thumbnail: { src: "http://t.plnspttrs.net/photo.jpg" },
      link: "https://www.planespotters.net/photo/123/example",
    }] }));
    await expect(provider(http).getPhoto("5EC002")).resolves.toMatchObject({ photo: null });
  });

  it("preserves attribution and source link while caching positive and negative results", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(jsonResponse(photoPayload))
      .mockResolvedValueOnce(jsonResponse({ photos: [] }));
    const photoProvider = provider(fetcher);

    const first = await photoProvider.getPhoto("CAA001");
    const second = await photoProvider.getPhoto("CAA001");
    const negativeFirst = await photoProvider.getPhoto("CAA002");
    const negativeSecond = await photoProvider.getPhoto("CAA002");

    expect(first).toMatchObject({ cached: false, photo: { attribution: "© Jane Photographer" } });
    expect(second).toMatchObject({ cached: true, photo: { sourceUrl: photoPayload.photos[0].link } });
    expect(negativeFirst).toMatchObject({ cached: false, photo: null });
    expect(negativeSecond).toMatchObject({ cached: true, photo: null });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("coalesces concurrent lookups by ICAO hex", async () => {
    let resolveResponse!: (response: Response) => void;
    const fetcher = vi.fn().mockReturnValue(new Promise<Response>((resolve) => { resolveResponse = resolve; }));
    const photoProvider = provider(fetcher);
    const first = photoProvider.getPhoto("C0A001");
    const second = photoProvider.getPhoto("C0A001");

    expect(fetcher).toHaveBeenCalledTimes(1);
    resolveResponse(jsonResponse(photoPayload));
    const results = await Promise.all([first, second]);
    expect(results[0].photo).toEqual(results[1].photo);
  });

  it("keeps the process-local metadata cache bounded", async () => {
    const fetcher = vi.fn().mockResolvedValue(jsonResponse(photoPayload));
    const cache = new AircraftPhotoCache({ maxEntries: 2 });
    const photoProvider = provider(fetcher, { cache });

    await photoProvider.getPhoto("B0D001");
    await photoProvider.getPhoto("B0D002");
    await photoProvider.getPhoto("B0D003");
    expect(cache.size()).toBe(2);
    await photoProvider.getPhoto("B0D001");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});

describe("AIRCRAFT PHOTOS V1 API and UI boundaries", () => {
  it("returns disabled safely and does not call the upstream provider", async () => {
    vi.stubEnv("AIRCRAFT_PHOTOS_ENABLED", "false");
    const fetcher = vi.fn();
    vi.stubGlobal("fetch", fetcher);

    const response = await getAircraftPhotoRoute(new Request("http://localhost/api/aircraft/ABC123/photo"), { params: Promise.resolve({ hex: "ABC123" }) });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ photo: null, enabled: false, cached: false, provider: "planespotters" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("returns a safe DTO and keeps upstream failures out of the aircraft detail path", async () => {
    vi.stubEnv("AIRCRAFT_PHOTOS_ENABLED", "true");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse({ photos: [] }, 503)));

    const response = await getAircraftPhotoRoute(new Request("http://localhost/api/aircraft/F00BAA/photo"), { params: Promise.resolve({ hex: "F00BAA" }) });
    const body = await response.json() as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body).toEqual({ photo: null, enabled: true, cached: false, provider: "planespotters" });
    expect(JSON.stringify(body)).not.toContain("raw");
  });

  it("has Czech and English photo labels without adding a polling or EventSource path", () => {
    expect(getTranslations("cs").aircraft.photoTitle).toBe("Fotografie letadla");
    expect(getTranslations("en").aircraft.photoTitle).toBe("Aircraft photo");
    const componentSource = readFileSync(new URL("../components/aircraft-detail-v2.tsx", import.meta.url), "utf8");
    const streamSource = readFileSync(new URL("../app/api/stream/route.ts", import.meta.url), "utf8");
    expect(componentSource).toContain("/photo");
    expect(componentSource).not.toContain("EventSource");
    expect(componentSource).not.toContain("setInterval(");
    expect(streamSource).not.toContain("photo");
  });
});
