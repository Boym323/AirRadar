import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyT57Failure, establishSession, preflight } from "../scripts/t57-production-soak.mjs";

describe("T57/T58 authenticated diagnostics preflight", () => {
  it("classifies missing or unavailable admin authentication safely", () => {
    assert.equal(classifyT57Failure(new Error("authorization_missing")), "authentication_failure");
    assert.equal(classifyT57Failure(new Error("admin_auth_unavailable")), "authentication_failure");
    assert.equal(classifyT57Failure(new Error("Session login refused (HTTP 401)")), "authentication_failure");
    assert.equal(classifyT57Failure(new Error("Diagnostic request /api/system/status HTTP 503")), "http_failure");
    assert.equal(classifyT57Failure(Object.assign(new Error("request timeout"), { name: "TimeoutError" })), "http_timeout");
  });

  it("exposes only an allowlisted failure category for safe preflight logs", () => {
    const secretBearingError = new Error("Session login refused (HTTP 401) token=must-never-appear");
    const category = classifyT57Failure(secretBearingError);
    assert.equal(category, "authentication_failure");
    assert.equal(category.includes("must-never-appear"), false);
  });

  it("does not use public diagnostics when admin authentication is disabled", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ configured: false }), { status: 200 });
    try {
      await assert.rejects(establishSession(new URL("https://airradar.pomykal.cz/"), "not-a-real-token"),
        error => error?.message === "admin_auth_unavailable");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("requires the token after the server advertises configured authentication", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response(JSON.stringify({ configured: true }), { status: 200 });
    try {
      await assert.rejects(establishSession(new URL("https://airradar.pomykal.cz/"), ""),
        error => error?.message === "authorization_missing");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

describe("token-free T58 public preflight", () => {
  it("never requests a session or sends cookies", async () => {
    const fetchBefore = globalThis.fetch;
    const before = process.env.T57_PUBLIC_ONLY, base = process.env.T57_BASE_URL;
    process.env.T57_PUBLIC_ONLY = "1";
    process.env.T57_BASE_URL = "https://airradar.pomykal.cz";
    const urls = [];
    globalThis.fetch = async (url, options = {}) => {
      const path = new URL(String(url)).pathname;
      urls.push({ path, cookie: options.headers?.Cookie });
      if (path === "/api/system/status") return Response.json({
        detailLevel: "public", status: "ok",
        application: { commit: "a".repeat(40), version: "1.0.550",
          startedAt: "2026-10-21T10:00:00.000Z" },
      });
      if (path === "/api/system/runtime-performance") return Response.json({
        schemaVersion: 1, scope: "process-local",
        runtime: { status: "enabled", rssBytes: 100000, heapUsedBytes: 80000,
          cpuIntervalPercent: 10, eventLoopLagWindows: [] },
      });
      throw new Error("unexpected URL");
    };
    try {
      const result = await preflight();
      assert.equal(result.telemetryMode, "public");
      assert.equal(result.operationalTwinForensicsEnabled, false);
      assert.deepEqual(urls.map(v => v.path).sort(),
        ["/api/system/runtime-performance", "/api/system/status"]);
      assert.equal(urls.every(v => v.cookie === undefined), true);
    } finally {
      globalThis.fetch = fetchBefore;
      if (before === undefined) delete process.env.T57_PUBLIC_ONLY;
      else process.env.T57_PUBLIC_ONLY = before;
      if (base === undefined) delete process.env.T57_BASE_URL;
      else process.env.T57_BASE_URL = base;
    }
  });
});
