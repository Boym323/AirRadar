#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/3af70a89c2de2a6c3cbaa7916e2c6e82be694b8cb7447855fd09e729677f755d/contract';
import endContract from '../../snapshots/3af70a89c2de2a6c3cbaa7916e2c6e82be694b8cb7447855fd09e729677f755d/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e3bf564c9411e9f035997c4aaa16f47d4536112fa3be0d7fba87cb0ae3ccbc96/contract';
import startContract from '../../snapshots/e3bf564c9411e9f035997c4aaa16f47d4536112fa3be0d7fba87cb0ae3ccbc96/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'predictiveObservation',
        columns: [
          col('aircraftIcao', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('alternativeRunway', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('altitudeFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('callsign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('capability', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('destinationIcao', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('distanceRemainingNm', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('etaConfidence', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('evidenceJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('flightId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('flightPhase', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('graduationMode', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('groundSpeedKt', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('horizonBucket', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('horizonSeconds', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('lifecycleKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('modelVersion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('observationKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('predictedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('predictedLandingAt', 'timestamptz', {
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('predictedRunway', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('predictionConfidence', 'text', {
            notNull: true,
            codecRef: { codecId: 'pg/text@1' },
          }),
          col('previousRunway', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('softwareVersion', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('trackDeg', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('verticalRateFpm', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
        ],
        constraints: [primaryKey(['observationKey'])],
      }),
      this.createIndex({
        schema: 'public',
        table: 'predictiveObservation',
        index: 'predictiveObservation_capability_predictedAt_idx_285afb25',
        columns: ['capability', 'predictedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'predictiveObservation',
        index: 'predictiveObservation_destinationIcao_predictedAt_idx_4b3c94e0',
        columns: ['destinationIcao', 'predictedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'predictiveObservation',
        index: 'predictiveObservation_flightId_predictedAt_idx_1e774c2e',
        columns: ['flightId', 'predictedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'predictiveObservation',
        index: 'predictiveObservation_lifecycleKey_predictedAt_idx_fd99cf03',
        columns: ['lifecycleKey', 'predictedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'predictiveObservation',
        index: 'predictiveObservation_predictedAt_idx_8d1dd89c',
        columns: ['predictedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
