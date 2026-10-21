import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { classifyT57Failure, establishSession } from "../scripts/t57-production-soak.mjs";

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
