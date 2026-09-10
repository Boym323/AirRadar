#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/0f707820bb833a4886fc292b9003b82408bac10a51f03f7b2858123cd2b25409/contract';
import startContract from '../../snapshots/0f707820bb833a4886fc292b9003b82408bac10a51f03f7b2858123cd2b25409/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/b332f6de2e8028b03d145c733735d73aea24b7ab1fa8f41968f3f97c29dd53dc/contract';
import endContract from '../../snapshots/b332f6de2e8028b03d145c733735d73aea24b7ab1fa8f41968f3f97c29dd53dc/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'receiverDailyCoverageAltitude',
        columns: [
          col('altitudeBand', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('azimuthBucket', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('date', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('maxDistanceKm', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['date', 'azimuthBucket', 'altitudeBand'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('maxGroundSpeedAt', 'timestamptz', {
          codecRef: { codecId: 'pg/timestamptz-temporal@1' },
        }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('maxGroundSpeedCallsign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('maxGroundSpeedIcaoHex', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('maxGroundSpeedKt', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('maxGroundSpeedRegistration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('receiverMessagesCount', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'receiverDailyStats',
        column: col('receiverMessagesRawLast', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
      }),
      this.createIndex({
        schema: 'public',
        table: 'receiverDailyCoverageAltitude',
        index: 'receiverDailyCoverageAltitude_date_idx_b4ca319c',
        columns: ['date'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'receiverDailyCoverageAltitude',
        foreignKey: {
          name: 'receiverDailyCoverageAltitude_date_fkey',
          columns: ['date'],
          references: { schema: 'public', table: 'receiverDailyStats', columns: ['date'] },
          onDelete: 'cascade',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
