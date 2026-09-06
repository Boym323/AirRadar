#!/usr/bin/env -S node
import 'temporal-polyfill/full/global';
import type { Contract as Start } from '../../snapshots/101bdf9f149189688df883b35cc40eac9dc12f98ea8d70310be798f8c52ff7c0/contract';
import startContract from '../../snapshots/101bdf9f149189688df883b35cc40eac9dc12f98ea8d70310be798f8c52ff7c0/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/43eb03bf38fa01c6fa4f03595f6160db5bcb07e7b3a8edf3fcc4ecdeaf0605ee/contract';
import endContract from '../../snapshots/43eb03bf38fa01c6fa4f03595f6160db5bcb07e7b3a8edf3fcc4ecdeaf0605ee/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'atcTransmitter',
        column: col('validFrom', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'atcTransmitter',
        column: col('validTo', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'atcSector',
        column: col('lastVerifiedAt', 'timestamptz', {
          notNull: true,
          default: fn('now()'),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'atcSector',
        column: col('sourceReference', 'text', {
          notNull: true,
          default: lit('legacy://unknown-atc-source'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'atcTransmitter',
        column: col('lastVerifiedAt', 'timestamptz', {
          notNull: true,
          default: fn('now()'),
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'atcTransmitter',
        column: col('source', 'text', {
          notNull: true,
          default: lit('Legacy imported ATC row'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'atcTransmitter',
        column: col('sourceReference', 'text', {
          notNull: true,
          default: lit('legacy://unknown-atc-source'),
          codecRef: { codecId: 'pg/text@1' },
        }),
      }),
      this.dropDefault({ schema: 'public', table: 'atcSector', column: 'lastVerifiedAt' }),
      this.dropDefault({ schema: 'public', table: 'atcSector', column: 'sourceReference' }),
      this.dropDefault({ schema: 'public', table: 'atcTransmitter', column: 'lastVerifiedAt' }),
      this.dropDefault({ schema: 'public', table: 'atcTransmitter', column: 'source' }),
      this.dropDefault({ schema: 'public', table: 'atcTransmitter', column: 'sourceReference' }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
