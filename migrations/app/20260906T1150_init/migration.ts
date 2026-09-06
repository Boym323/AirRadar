#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/be38e5ecee30731fe25fd1f08cf34b476a11c6406848ba4d0d3bc81a6a751864/contract';
import endContract from '../../snapshots/be38e5ecee30731fe25fd1f08cf34b476a11c6406848ba4d0d3bc81a6a751864/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<never, End> {
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createSchema({ schema: 'public' }),
      this.createTable({
        schema: 'public',
        table: 'aircraft',
        columns: [
          col('aircraftType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('icaoHex', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('registration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'flight',
        columns: [
          col('aircraftId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('callsign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('endTime', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('startTime', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'flightPosition',
        columns: [
          col('altitude', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('flightId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('groundSpeed', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lat', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('lon', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('recordedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('track', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('verticalRate', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'aircraft',
        constraint: 'aircraft_icaoHex_key',
        columns: ['icaoHex'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flight',
        index: 'flight_aircraftId_idx_4bc2d770',
        columns: ['aircraftId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flight',
        index: 'flight_aircraftId_startTime_idx_df9cbc5e',
        columns: ['aircraftId', 'startTime'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flightPosition',
        index: 'flightPosition_flightId_idx_7ef5148f',
        columns: ['flightId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flightPosition',
        index: 'flightPosition_flightId_recordedAt_idx_750175c0',
        columns: ['flightId', 'recordedAt'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'flight',
        foreignKey: {
          name: 'flight_aircraftId_fkey',
          columns: ['aircraftId'],
          references: { schema: 'public', table: 'aircraft', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'flightPosition',
        foreignKey: {
          name: 'flightPosition_flightId_fkey',
          columns: ['flightId'],
          references: { schema: 'public', table: 'flight', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
