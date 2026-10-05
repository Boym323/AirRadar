#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/3af70a89c2de2a6c3cbaa7916e2c6e82be694b8cb7447855fd09e729677f755d/contract';
import startContract from '../../snapshots/3af70a89c2de2a6c3cbaa7916e2c6e82be694b8cb7447855fd09e729677f755d/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/2f29cf4ac6d73920fcc305c2d806427d59b0b3e2f4a74bdb40b7eca5ffc80688/contract';
import endContract from '../../snapshots/2f29cf4ac6d73920fcc305c2d806427d59b0b3e2f4a74bdb40b7eca5ffc80688/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'operationalTwinCalibrationBucket',
        columns: [
          col('bucketStart', 'timestamptz', { notNull: true, codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('lane', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('payloadJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', { notNull: true, default: fn('now()'), codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('version', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['lane', 'version', 'bucketStart'])],
      }),
    ];
  }
}
MigrationCLI.run(import.meta.url, M);
