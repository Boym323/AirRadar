#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/43eb03bf38fa01c6fa4f03595f6160db5bcb07e7b3a8edf3fcc4ecdeaf0605ee/contract';
import startContract from '../../snapshots/43eb03bf38fa01c6fa4f03595f6160db5bcb07e7b3a8edf3fcc4ecdeaf0605ee/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/5f8e1c2935768d75d211067117d79cf055939ef34b39de0ff648f9054a037ff9/contract';
import endContract from '../../snapshots/5f8e1c2935768d75d211067117d79cf055939ef34b39de0ff648f9054a037ff9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'atcSector',
        column: col('lowerAltitudeReference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'atcSector',
        column: col('upperAltitudeReference', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
