#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/eb479bfb140b642bd13609622ee70d416e049143171d336c43ab181809e3916c/contract';
import startContract from '../../snapshots/eb479bfb140b642bd13609622ee70d416e049143171d336c43ab181809e3916c/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/81bbebf2a29b337d4ce2126c076b28984e3fdc013cbffbf99de6f931e386d1b9/contract';
import endContract from '../../snapshots/81bbebf2a29b337d4ce2126c076b28984e3fdc013cbffbf99de6f931e386d1b9/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';
export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract; override readonly endContractJson = endContract;
  override get operations() { return [
    this.createTable({ schema: 'public', table: 'flightEvent', columns: [
      col('airportIcao', 'text', { codecRef: { codecId: 'pg/text@1' } }), col('altitude', 'int4', { codecRef: { codecId: 'pg/int4@1' } }), col('confidence', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }), col('createdAt', 'timestamptz', { notNull: true, default: fn('now()'), codecRef: { codecId: 'pg/timestamptz-temporal@1' } }), col('detectedAt', 'timestamptz', { notNull: true, default: fn('now()'), codecRef: { codecId: 'pg/timestamptz-temporal@1' } }), col('eventKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }), col('evidenceJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }), col('flightId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }), col('icaoHex', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }), col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }), col('latitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }), col('longitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }), col('metadataJson', 'text', { codecRef: { codecId: 'pg/text@1' } }), col('occurredAt', 'timestamptz', { notNull: true, codecRef: { codecId: 'pg/timestamptz-temporal@1' } }), col('runway', 'text', { codecRef: { codecId: 'pg/text@1' } }), col('sectorId', 'text', { codecRef: { codecId: 'pg/text@1' } }), col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
    ], constraints: [primaryKey(['id'])] }),
    this.addForeignKey({ schema: 'public', table: 'flightEvent', foreignKey: { name: 'flightEvent_icaoHex_fkey', columns: ['icaoHex'], references: { schema: 'public', table: 'aircraft', columns: ['icaoHex'] }, onDelete: 'cascade' } }),
    this.addForeignKey({ schema: 'public', table: 'flightEvent', foreignKey: { name: 'flightEvent_flightId_fkey', columns: ['flightId'], references: { schema: 'public', table: 'flight', columns: ['id'] }, onDelete: 'setNull' } }),
    this.addUnique({ schema: 'public', table: 'flightEvent', constraint: 'flightEvent_eventKey_key', columns: ['eventKey'] }),
    this.createIndex({ schema: 'public', table: 'flightEvent', index: 'flightEvent_airportIcao_occurredAt_idx_8182f1e6', columns: ['airportIcao', 'occurredAt'] }),
    this.createIndex({ schema: 'public', table: 'flightEvent', index: 'flightEvent_flightId_idx_7ef5148f', columns: ['flightId'] }),
    this.createIndex({ schema: 'public', table: 'flightEvent', index: 'flightEvent_flightId_occurredAt_idx_fcd57517', columns: ['flightId', 'occurredAt'] }),
    this.createIndex({ schema: 'public', table: 'flightEvent', index: 'flightEvent_icaoHex_idx_f7ba3f5f', columns: ['icaoHex'] }),
    this.createIndex({ schema: 'public', table: 'flightEvent', index: 'flightEvent_icaoHex_occurredAt_idx_ba255191', columns: ['icaoHex', 'occurredAt'] }),
    this.createIndex({ schema: 'public', table: 'flightEvent', index: 'flightEvent_occurredAt_idx_c6b89167', columns: ['occurredAt'] }),
    this.createIndex({ schema: 'public', table: 'flightEvent', index: 'flightEvent_type_occurredAt_idx_4a74ac21', columns: ['type', 'occurredAt'] }),
  ]; }
}
MigrationCLI.run(import.meta.url, M);
