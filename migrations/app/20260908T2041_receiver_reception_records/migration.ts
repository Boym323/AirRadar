#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/03aa657ab742b58e9acb95c3556a50f3ab7ec364cd0aeee203514e8688912ee2/contract';
import endContract from '../../snapshots/03aa657ab742b58e9acb95c3556a50f3ab7ec364cd0aeee203514e8688912ee2/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/bbcfb4088e2366a48ee437073168056f779d16f29fd86258627fc1b091f290a4/contract';
import startContract from '../../snapshots/bbcfb4088e2366a48ee437073168056f779d16f29fd86258627fc1b091f290a4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('maxDistanceBearing', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('maxDistanceRegistration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'receiverDailyStats',
        index: 'receiverDailyStats_maxDistanceKm_idx_61c7213a',
        columns: ['maxDistanceKm'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
