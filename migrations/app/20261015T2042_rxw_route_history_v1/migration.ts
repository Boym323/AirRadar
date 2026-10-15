#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/1b47349b9d370927a9991a63fe992dd054ae3f243e5e921fd76d0bba867c3265/contract';
import endContract from '../../snapshots/1b47349b9d370927a9991a63fe992dd054ae3f243e5e921fd76d0bba867c3265/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/4e7d270894dd166bd41852e3fac65414baa84ffa5c4bde53cf9b41d134c4053a/contract';
import startContract from '../../snapshots/4e7d270894dd166bd41852e3fac65414baa84ffa5c4bde53cf9b41d134c4053a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'schema.rxwRouteSnapshot.adopt_or_create',
        label: 'Adopt or create RXW route history schema',
        operationClass: 'additive',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'RxwRouteSnapshot' } },
        precheck: [],
        execute: [
          {
            description: 'Create RXW route history table when absent',
            sql: `CREATE TABLE IF NOT EXISTS "public"."RxwRouteSnapshot" (
  "id" text PRIMARY KEY,
  "icaoHex" text NOT NULL,
  "flight" text NOT NULL,
  "kind" text NOT NULL,
  "origin" text NOT NULL,
  "destination" text NOT NULL,
  "etaUtc" text,
  "waypointsJson" text NOT NULL,
  "positionedCount" integer NOT NULL,
  "stationId" text NOT NULL,
  "protocol" text NOT NULL,
  "observedAtMs" bigint NOT NULL,
  "source" text NOT NULL DEFAULT 'rxw-acarshub',
  "createdAt" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT rxw_route_kind CHECK ("kind" IN ('FPN','AIRPORT_PAIR')),
  CONSTRAINT rxw_route_identity CHECK ("icaoHex" ~ '^[A-F0-9]{6}$' AND "flight" ~ '^[A-Z0-9]{2,10}$'),
  CONSTRAINT rxw_route_airports CHECK ("origin" ~ '^[A-Z]{3,4}$' AND "destination" ~ '^[A-Z]{3,4}$' AND "origin" <> "destination"),
  CONSTRAINT rxw_route_size CHECK (length("waypointsJson") <= 8192 AND "positionedCount" BETWEEN 0 AND 80),
  CONSTRAINT rxw_route_provenance CHECK ("source" = 'rxw-acarshub'),
  CONSTRAINT rxw_route_time CHECK ("observedAtMs" > 0)
)`,
            params: [],
          },
          {
            description: 'Create RXW route history indexes when absent',
            sql: 'CREATE INDEX IF NOT EXISTS "rxw_route_icao_flight_time_idx" ON "public"."RxwRouteSnapshot" ("icaoHex", "flight", "observedAtMs")',
            params: [],
          },
          {
            description: 'Create RXW route observation index when absent',
            sql: 'CREATE INDEX IF NOT EXISTS "rxw_route_observed_idx" ON "public"."RxwRouteSnapshot" ("observedAtMs")',
            params: [],
          },
        ],
        postcheck: [{
          description: 'Verify RXW route history table and indexes exist',
          sql: `SELECT (
  to_regclass('"public"."RxwRouteSnapshot"') IS NOT NULL
  AND to_regclass('"public"."rxw_route_icao_flight_time_idx"') IS NOT NULL
  AND to_regclass('"public"."rxw_route_observed_idx"') IS NOT NULL
) AS "result"`,
          params: [],
        }],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
