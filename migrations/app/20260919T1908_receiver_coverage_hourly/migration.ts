#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/81bbebf2a29b337d4ce2126c076b28984e3fdc013cbffbf99de6f931e386d1b9/contract';
import startContract from '../../snapshots/81bbebf2a29b337d4ce2126c076b28984e3fdc013cbffbf99de6f931e386d1b9/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5f589e4c9058458ea8e55834f67f9da7514878642ca647c09ad74f7bfeb08dcd/contract';
import endContract from '../../snapshots/5f589e4c9058458ea8e55834f67f9da7514878642ca647c09ad74f7bfeb08dcd/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;
  override get operations() {
    return [this.createTable({ schema: 'public', table: 'receiverCoverageHourly', columns: [
      col('availableCount', 'int4', { notNull: true, default: lit(0), codecRef: { codecId: 'pg/int4@1' } }),
      col('bucketKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
      col('capturedCount', 'int4', { notNull: true, default: lit(0), codecRef: { codecId: 'pg/int4@1' } }),
      col('dimension', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
      col('hour', 'timestamptz', { notNull: true, codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
      col('referenceProviders', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
      col('updatedAt', 'timestamptz', { notNull: true, default: fn('now()'), codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
    ], constraints: [primaryKey(['hour', 'bucketKey'])] }),
    this.createIndex({ schema: 'public', table: 'receiverCoverageHourly', index: 'receiverCoverageHourly_hour_idx_4913b1c9', columns: ['hour'] }),
    this.createIndex({ schema: 'public', table: 'receiverCoverageHourly', index: 'receiverCoverageHourly_dimension_hour_idx_ba706ddd', columns: ['dimension', 'hour'] })];
  }
}
MigrationCLI.run(import.meta.url, M);
