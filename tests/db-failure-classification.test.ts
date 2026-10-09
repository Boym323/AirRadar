import { beforeEach, describe, expect, it } from "vitest";
import { classifyDbFailure } from "@/lib/server/db-failure-classification";
import { getDbOperationFailureFamilies, trackDbOperation } from "@/lib/server/db-operation-diagnostics";
import { getDbTransactionFailureFamilies, trackDbTransaction } from "@/lib/server/db-transaction-diagnostics";

describe("sanitized database failure taxonomy", () => {
  it("conservatively classifies SQLSTATE and Prisma codes", () => {
    expect(classifyDbFailure({ code: "23505" })).toBe("constraint");
    expect(classifyDbFailure({ code: "40001" })).toBe("conflict");
    expect(classifyDbFailure({ code: "P2034" })).toBe("conflict");
    expect(classifyDbFailure({ code: "P1001" })).toBe("connection");
    expect(classifyDbFailure({ code: "57014" })).toBe("timeout");
    expect(classifyDbFailure(new Error("secret SQL parameters"))).toBe("unknown");
    expect(classifyDbFailure({ code: "SENSITIVE" })).toBe("unknown");
  });

  it("counts failures and rethrows the same original error", async () => {
    const err = Object.assign(new Error("never persist my SQL"), { code: "23505" });
    const beforeTx = getDbTransactionFailureFamilies().constraint;
    const beforeOp = getDbOperationFailureFamilies().constraint;
    await expect(trackDbTransaction("history.snapshot", async () => { throw err; })).rejects.toBe(err);
    await expect(trackDbOperation("history.list.query", async () => { throw err; })).rejects.toBe(err);
    expect(getDbTransactionFailureFamilies().constraint).toBe(beforeTx + 1);
    expect(getDbOperationFailureFamilies().constraint).toBe(beforeOp + 1);
    expect(JSON.stringify(getDbTransactionFailureFamilies())).not.toContain("SQL");
  });
});
