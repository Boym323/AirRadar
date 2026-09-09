#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/03aa657ab742b58e9acb95c3556a50f3ab7ec364cd0aeee203514e8688912ee2/contract';
import startContract from '../../snapshots/03aa657ab742b58e9acb95c3556a50f3ab7ec364cd0aeee203514e8688912ee2/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e05c22fd90a750642d9e212984e8b9d0797d81c37a9754fb29eebf0e50c82a08/contract';
import endContract from '../../snapshots/e05c22fd90a750642d9e212984e8b9d0797d81c37a9754fb29eebf0e50c82a08/contract.json' with { type: 'json' };
import { Migration, MigrationCLI } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createIndex({
        schema: 'public',
        table: 'flight',
        index: 'flight_startTime_destination_idx_abea9f87',
        columns: ['startTime', 'destination'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flight',
        index: 'flight_startTime_origin_idx_ace20491',
        columns: ['startTime', 'origin'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
