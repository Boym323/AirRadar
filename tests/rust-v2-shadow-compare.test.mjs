import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { checkedUrl, compareRadarSnapshots, boundedGetJson, runShadow } from "../scripts/rust-v2-shadow-compare.mjs";

const now = Date.now();
const id = "ABC123";
const baseV1 = { aircraft: [{ icaoHex: id, lastSeen: new Date(now-2000).toISOString(), lat: 49.90, lon: 15.3, origin: "local" }] };
const baseV2 = { status: "live", data: { kind: "snapshot", epoch: "e", seq: 2, generatedAt: new Date(now).toISOString(),
  aircraft: [{ id: "icao:abc123", lastMessageAt: (now-3000)/1000, lastPositionAt: (now-2500)/1000,
    position: { lat: 49.9002, lon: 15.3001 }, stale: false }] } };

describe("manual read-only Rust V2 shadow comparator", () => {
  it("compares matching local aircraft without releasing any identity or coordinates", () => {
    const report = compareRadarSnapshots(baseV1, baseV2);
    assert.equal(report.common, 1);
    assert.equal(report.positionPairs, 1);
    assert.equal(report.positionOutliersOver5Km, 0);
    assert.equal(report.assessment, "MEASURED_NOT_ACCEPTED");
    assert.equal(JSON.stringify(report).includes(id), false);
    assert.equal(JSON.stringify(report).includes("49.90"), false);
  });
  it("counts divergence while avoiding misleading comparison of unsynchronized positions", () => {
    const changed = structuredClone(baseV2);
    changed.data.aircraft[0].lastMessageAt = (now - 20000)/1000;
    const result = compareRadarSnapshots(baseV1, changed);
    assert.equal(result.common, 1);
    assert.equal(result.comparableTime, 0);
    assert.equal(result.assessment, "INSUFFICIENT_OVERLAP");
  });
  it("omits network-only targets and refuses invalid snapshots", () => {
    const candidate = { aircraft: [
      { ...baseV1.aircraft[0], origin: "adsblol" },
      { ...baseV1.aircraft[0], icaoHex: "123456" },
    ] };
    assert.equal(compareRadarSnapshots(candidate, baseV2).v1Current, 1);
    assert.throws(() => compareRadarSnapshots(baseV1, { ...baseV2, status: "waiting_for_observations" }));
  });
  it("enforces exact read-only snapshot endpoints", () => {
    assert.equal(checkedUrl("https://radar.invalid/api/aircraft?coverage=extended", "v1").search, "?coverage=local");
    assert.throws(() => checkedUrl("http://radar.invalid/api/aircraft", "v1"));
    assert.throws(() => checkedUrl("https://u:p@radar.invalid/api/aircraft", "v1"));
    assert.throws(() => checkedUrl("https://radar.invalid/api/v1/stream", "v2"));
    assert.equal(checkedUrl("http://127.0.0.1:4101/api/v1/aircraft", "v2").pathname, "/api/v1/aircraft");
  });
  it("rejects unreadable or oversized GET responses", async () => {
    const url = new URL("http://localhost/api/v1/aircraft");
    await assert.rejects(() => boundedGetJson(url, async () => new Response("{}", {
      status: 200, headers: { "content-length": String(9_000_000) },
    })));
    await assert.rejects(() => boundedGetJson(url, async () => new Response("bad json")));
  });
  it("requires only two GETs and never sends identifiers or POSTs", async () => {
    const requests = [];
    const fetcher = async (url, opts) => {
      requests.push({ method: opts.method, path: url.pathname, query: url.searchParams.toString() });
      return Response.json(url.pathname === "/api/aircraft" ? baseV1 : baseV2);
    };
    const report = await runShadow("http://localhost/api/aircraft", "http://localhost/api/v1/aircraft", fetcher);
    assert.equal(report.common, 1);
    assert.deepEqual(requests.map(r => r.method), ["GET", "GET"]);
    assert.deepEqual(requests.map(r => r.path), ["/api/aircraft", "/api/v1/aircraft"]);
    assert.equal(requests[0].query, "coverage=local");
  });
});
