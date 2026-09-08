#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/5d03f987451632a457e9319778b5348c01528a51efdb3ebcbaf9d7e1eac3a384/contract';
import startContract from '../../snapshots/5d03f987451632a457e9319778b5348c01528a51efdb3ebcbaf9d7e1eac3a384/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/bbcfb4088e2366a48ee437073168056f779d16f29fd86258627fc1b091f290a4/contract';
import endContract from '../../snapshots/bbcfb4088e2366a48ee437073168056f779d16f29fd86258627fc1b091f290a4/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'receiverDailyAircraft',
        columns: [
          col('aircraftType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('airline', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('date', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('icaoHex', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['date', 'icaoHex'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'receiverDailyCoverage',
        columns: [
          col('azimuthBucket', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('date', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('maxDistanceKm', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['date', 'azimuthBucket'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'receiverDailyStats',
        columns: [
          col('date', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('maxConcurrentAircraft', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('maxDistanceAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('maxDistanceIcaoHex', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('maxDistanceKm', 'float8', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/float8@1' },
          }),
          col('uniqueAircraftCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['date'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'receiverDailyAircraft',
        index: 'receiverDailyAircraft_date_idx_b4ca319c',
        columns: ['date'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'receiverDailyCoverage',
        index: 'receiverDailyCoverage_date_idx_b4ca319c',
        columns: ['date'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'receiverDailyAircraft',
        foreignKey: {
          name: 'receiverDailyAircraft_date_fkey',
          columns: ['date'],
          references: { schema: 'public', table: 'receiverDailyStats', columns: ['date'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'receiverDailyCoverage',
        foreignKey: {
          name: 'receiverDailyCoverage_date_fkey',
          columns: ['date'],
          references: { schema: 'public', table: 'receiverDailyStats', columns: ['date'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
