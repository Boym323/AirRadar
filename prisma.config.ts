import "dotenv/config";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as definePostgresConfig } from "@prisma/orm-postgres/config";

const connection = process.env["DATABASE_URL"];

export default definePrismaConfig({
  orm: definePostgresConfig({
    contract: "./prisma/contract.prisma",
    output: "./generated/prisma8",
    ...(connection ? { db: { connection } } : {}),
  }),
});
