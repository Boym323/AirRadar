import { describe, expect, it } from "vitest";
import { datasetErrorCategory, datasetRetryDelayMs, shouldRetryDataset } from "@/components/use-dataset-query";

describe("dataset retry policy", () => {
  it("retries transient categories but not client failures", () => {
    expect(shouldRetryDataset(0, Object.assign(new Error("server"), { status: 503 }))).toBe(true);
    expect(shouldRetryDataset(3, Object.assign(new Error("rate limited"), { status: 429 }))).toBe(true);
    expect(shouldRetryDataset(4, Object.assign(new Error("server"), { status: 503 }))).toBe(false);
    expect(shouldRetryDataset(0, Object.assign(new Error("not found"), { status: 404 }))).toBe(false);
    expect(shouldRetryDataset(0, new TypeError("network"))).toBe(true);
  });

  it("honors Retry-After and otherwise uses bounded backoff", () => {
    expect(datasetRetryDelayMs(0, Object.assign(new Error("retry"), { retryAfterMs: 1_000 }))).toBe(1_000);
    expect(datasetRetryDelayMs(0, new Error("retry"))).toBe(5_000);
    expect(datasetRetryDelayMs(1, new Error("retry"))).toBe(15_000);
    expect(datasetRetryDelayMs(2, new Error("retry"))).toBe(30_000);
    expect(datasetRetryDelayMs(9, new Error("retry"))).toBe(60_000);
  });

  it("classifies server, rate-limit, client, network and malformed errors", () => {
    expect(datasetErrorCategory(Object.assign(new Error("rate"), { status: 429 }))).toBe("rate_limited");
    expect(datasetErrorCategory(Object.assign(new Error("server"), { status: 500 }))).toBe("server");
    expect(datasetErrorCategory(Object.assign(new Error("client"), { status: 400 }))).toBe("client");
    expect(datasetErrorCategory(new TypeError("network"))).toBe("network");
    expect(datasetErrorCategory(new Error("shape"))).toBe("malformed");
  });
});
