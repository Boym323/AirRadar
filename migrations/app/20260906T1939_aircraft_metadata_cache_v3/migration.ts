#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/5d03f987451632a457e9319778b5348c01528a51efdb3ebcbaf9d7e1eac3a384/contract';
import endContract from '../../snapshots/5d03f987451632a457e9319778b5348c01528a51efdb3ebcbaf9d7e1eac3a384/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/5f8e1c2935768d75d211067117d79cf055939ef34b39de0ff648f9054a037ff9/contract';
import startContract from '../../snapshots/5f8e1c2935768d75d211067117d79cf055939ef34b39de0ff648f9054a037ff9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'aircraftMetadataCache',
        columns: [
          col('aircraftDescription', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('datasetVersion', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('flags', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('icaoHex', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('icaoTypeCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('operator', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('registration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceReference', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('year', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['icaoHex'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'aircraftMetadataSync',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('etag', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastCheckedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('lastError', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('lastUpdatedAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('recordCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('sourceUrl', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'aircraftMetadataCache',
        index: 'aircraftMetadataCache_source_idx_c937a07d',
        columns: ['source'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'aircraftMetadataCache',
        index: 'aircraftMetadataCache_updatedAt_idx_8c508b31',
        columns: ['updatedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
