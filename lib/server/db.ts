import postgres from "@prisma/orm-postgres/runtime";
import type { Contract } from "@/generated/prisma8/contract";
import contractJson from "@/generated/prisma8/contract.json" with { type: "json" };

function createDatabase() {
  return postgres<Contract>({
    contractJson,
    url: process.env["DATABASE_URL"],
  });
}

type AirRadarDatabase = ReturnType<typeof createDatabase>;
const globalForPrisma = globalThis as unknown as { airRadarDb?: AirRadarDatabase };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPrisma(): AirRadarDatabase | null {
  if (!isDatabaseConfigured()) return null;
  globalForPrisma.airRadarDb ??= createDatabase();
  return globalForPrisma.airRadarDb;
}
