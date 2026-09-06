import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getPrisma(): PrismaClient | null {
  if (!isDatabaseConfigured()) return null;
  globalForPrisma.prisma ??= new PrismaClient();
  return globalForPrisma.prisma;
}
