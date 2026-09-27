#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5f589e4c9058458ea8e55834f67f9da7514878642ca647c09ad74f7bfeb08dcd/contract';
import startContract from '../../snapshots/5f589e4c9058458ea8e55834f67f9da7514878642ca647c09ad74f7bfeb08dcd/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/7e7ffb7e83373c67316fe3b66555da515e7da2d7bc47897560c65d38611de794/contract';
import endContract from '../../snapshots/7e7ffb7e83373c67316fe3b66555da515e7da2d7bc47897560c65d38611de794/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'altitudeAnomaly',
        columns: [
          col('anomalyType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('candidatesJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('decisionReason', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('detectedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('flightId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('icaoHex', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('observedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('selectedAltitude', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('selectedSource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'flightPosition',
        column: col('altitudeDecisionReason', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'flightPosition',
        column: col('altitudeObservedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'flightPosition',
        column: col('altitudeProtocol', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'flightPosition',
        column: col('altitudeProvider', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'flightPosition',
        column: col('altitudeSource', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'flightPosition',
        column: col('altitudeType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'altitudeAnomaly',
        index: 'altitudeAnomaly_flightId_observedAt_idx_5328fee5',
        columns: ['flightId', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'altitudeAnomaly',
        index: 'altitudeAnomaly_icaoHex_observedAt_idx_66be2097',
        columns: ['icaoHex', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'altitudeAnomaly',
        index: 'altitudeAnomaly_observedAt_idx_980e226e',
        columns: ['observedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
