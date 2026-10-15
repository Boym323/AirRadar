import { afterEach, describe, expect, it } from "vitest";
import { closeSync, constants, fstatSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writePrivateAuditReport } from "../scripts/private-audit-report.mjs";
import { safeCommit, safeStoreId, safeTimestamp, safeVersion } from "../scripts/production-audit-sanitizers.mjs";

const directories = [];
function root() {
  const dir = mkdtempSync(join(tmpdir(), "airradar-audit-security-"));
  directories.push(dir);
  return dir;
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

// Permission metadata and content must come from the same opened inode.
// Avoid a stat(path) -> read(path) TOCTOU sequence in the regression test.
function readPrivateAuditFile(path) {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const content = readFileSync(fd, "utf8");
    const file = fstatSync(fd);
    expect(file.isFile()).toBe(true);
    expect(file.mode & 0o777).toBe(0o600);
    return content;
  } finally {
    closeSync(fd);
  }
}

describe("private production audit output", () => {
  it("writes only new private bounded files with matched JSON/Markdown content", async () => {
    const path = join(root(), "audit", "t55-report.json");
    const md = "# Report\nOnly aggregates";
    expect(await writePrivateAuditReport(path, { schemaVersion: 1, count: 42 }, md))
      .toBe(path.slice(0, -5) + ".md");
    expect(JSON.parse(readPrivateAuditFile(path))).toEqual({ schemaVersion: 1, count: 42 });
    expect(readPrivateAuditFile(path.slice(0, -5) + ".md")).toBe(md + "\n");
    await expect(writePrivateAuditReport(path, {}, "replacement")).rejects.toThrow();
    expect(JSON.parse(readPrivateAuditFile(path)).count).toBe(42);
  });

  it("does not overwrite an existing Markdown target or leave a partial JSON report", async () => {
    const path = join(root(), "audit.json");
    const mdPath = path.slice(0, -5) + ".md";
    writeFileSync(mdPath, "existing");
    await expect(writePrivateAuditReport(path, { value: 1 }, "# new")).rejects.toThrow();
    expect(readFileSync(mdPath, "utf8")).toBe("existing");
    expect(() => readFileSync(path, "utf8")).toThrow();
  });

  it("rejects invalid paths and excessive data before writing", async () => {
    const path = join(root(), "bounded.json");
    await expect(writePrivateAuditReport("../relative.json", {}, "hi")).rejects.toThrow("private_audit_output_path_required");
    await expect(writePrivateAuditReport(path, {}, "X".repeat(130_000))).rejects.toThrow("private_audit_report_too_large");
    await expect(writePrivateAuditReport(path, { payload: "X".repeat(2_200_000) }, "small"))
      .rejects.toThrow("private_audit_report_too_large");
    expect(() => readFileSync(path, "utf8")).toThrow();
  });
});

describe("network diagnostic string projections", () => {
  it("only permits bounded production identities and normalized dates", () => {
    expect(safeCommit("AABBCCDD1234")).toBe("aabbccdd1234");
    expect(safeCommit("aabb123")).toBe("aabb123");
    expect(safeCommit("token\nsecrets")).toBeNull();
    expect(safeCommit("Bearer secret")).toBeNull();
    expect(safeVersion("1.0.457")).toBe("1.0.457");
    expect(safeVersion("1.0.457\nraw")).toBeNull();
    expect(safeStoreId("stable-store")).toBe("stable-store");
    expect(safeStoreId("private\nheader")).toBeNull();
    expect(safeTimestamp("2026-10-15T10:00:00.000Z")).toBe("2026-10-15T10:00:00.000Z");
    expect(safeTimestamp("2026-10-15T10:00:00.000Z\n# injected")).toBeNull();
  });
});
