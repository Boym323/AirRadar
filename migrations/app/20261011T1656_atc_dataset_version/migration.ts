#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/2f29cf4ac6d73920fcc305c2d806427d59b0b3e2f4a74bdb40b7eca5ffc80688/contract';
import startContract from '../../snapshots/2f29cf4ac6d73920fcc305c2d806427d59b0b3e2f4a74bdb40b7eca5ffc80688/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/4e7d270894dd166bd41852e3fac65414baa84ffa5c4bde53cf9b41d134c4053a/contract';
import endContract from '../../snapshots/4e7d270894dd166bd41852e3fac65414baa84ffa5c4bde53cf9b41d134c4053a/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'atcDatasetVersion',
        columns: [
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('version', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      rawSql({
        id: 'data.atcDatasetVersion.bootstrap',
        label: 'Bootstrap ATC dataset version',
        operationClass: 'data',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'atcDatasetVersion' } },
        precheck: [],
        execute: [{
          description: 'Insert the initial ATC dataset version',
          sql: 'INSERT INTO "public"."atcDatasetVersion" ("id", "version") VALUES ($1, $2)',
          params: ['atc', 'bootstrap'],
        }],
        postcheck: [],
      }),
      rawSql({
        id: 'index.flight.flight_aircraftId_lastSeenAt_desc_idx',
        label: 'Ensure index "flight_aircraftId_lastSeenAt_desc_idx" exists',
        operationClass: 'additive',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'index', name: 'flight_aircraftId_lastSeenAt_desc_idx', table: 'flight' } },
        precheck: [],
        execute: [{
          description: 'Create the bounded flight history index if absent',
          sql: 'CREATE INDEX IF NOT EXISTS "flight_aircraftId_lastSeenAt_desc_idx" ON "public"."flight" ("aircraftId", "lastSeenAt")',
          params: [],
        }],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
