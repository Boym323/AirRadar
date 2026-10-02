#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7f3f38d07c5ff5c4fe85cc8c52ee2cdd0356e3ed349659d2a8e9b0586cd2b6ba/contract';
import startContract from '../../snapshots/7f3f38d07c5ff5c4fe85cc8c52ee2cdd0356e3ed349659d2a8e9b0586cd2b6ba/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e3bf564c9411e9f035997c4aaa16f47d4536112fa3be0d7fba87cb0ae3ccbc96/contract';
import endContract from '../../snapshots/e3bf564c9411e9f035997c4aaa16f47d4536112fa3be0d7fba87cb0ae3ccbc96/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;
  override get operations() {
    return [this.addColumn({ schema: 'public', table: 'flight', column: col('destinationProvenanceJson', 'text', { codecRef: { codecId: 'pg/text@1' } }) })];
  }
}
MigrationCLI.run(import.meta.url, M);
