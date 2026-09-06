#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/8d4569e67097208e26d7fe76228c6f6bc144bdd20d01729be844f382d35e775b/contract';
import endContract from '../../snapshots/8d4569e67097208e26d7fe76228c6f6bc144bdd20d01729be844f382d35e775b/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/be38e5ecee30731fe25fd1f08cf34b476a11c6406848ba4d0d3bc81a6a751864/contract';
import startContract from '../../snapshots/be38e5ecee30731fe25fd1f08cf34b476a11c6406848ba4d0d3bc81a6a751864/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'flight',
        column: col('lastSeenAt', 'timestamptz', {
          notNull: true,
          default: fn('now()'),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'flight',
        column: col('instanceKey', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      rawSql({
        id: 'sql.backfill-flight-instanceKey',
        label: 'Backfill flight instance keys',
        operationClass: 'additive',
        target: { id: 'postgres' },
        precheck: [],
        execute: [{
          description: 'backfill flight instance keys',
          sql: 'UPDATE "public"."flight" SET "instanceKey" = "aircraftId"::text || \':\' || "id"::text WHERE "instanceKey" IS NULL',
          params: [],
        }],
        postcheck: [],
      }),
      this.setNotNull({ schema: 'public', table: 'flight', column: 'instanceKey' }),
      this.addUnique({
        schema: 'public',
        table: 'flight',
        constraint: 'flight_instanceKey_key',
        columns: ['instanceKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flight',
        index: 'flight_aircraftId_endTime_lastSeenAt_idx_ae25d43c',
        columns: ['aircraftId', 'endTime', 'lastSeenAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flightPosition',
        index: 'flightPosition_recordedAt_idx_fd5b4732',
        columns: ['recordedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
