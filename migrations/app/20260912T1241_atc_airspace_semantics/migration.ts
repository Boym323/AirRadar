#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/b332f6de2e8028b03d145c733735d73aea24b7ab1fa8f41968f3f97c29dd53dc/contract';
import startContract from '../../snapshots/b332f6de2e8028b03d145c733735d73aea24b7ab1fa8f41968f3f97c29dd53dc/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/eb479bfb140b642bd13609622ee70d416e049143171d336c43ab181809e3916c/contract';
import endContract from '../../snapshots/eb479bfb140b642bd13609622ee70d416e049143171d336c43ab181809e3916c/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;
  override get operations() {
    return [
      this.addColumn({ schema: 'public', table: 'atcSector', column: col('airspaceType', 'text', { codecRef: { codecId: 'pg/text@1' } }) }),
      this.addColumn({ schema: 'public', table: 'atcSector', column: col('airspaceClass', 'text', { codecRef: { codecId: 'pg/text@1' } }) }),
      this.addColumn({ schema: 'public', table: 'atcSector', column: col('remarks', 'text', { codecRef: { codecId: 'pg/text@1' } }) }),
    ];
  }
}
MigrationCLI.run(import.meta.url, M);
