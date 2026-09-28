#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/a31a5aa55d41de3fca5295a33bb57a0a44e02ad993bfe4abe1acc353c2ad57e8/contract';
import endContract from '../../snapshots/a31a5aa55d41de3fca5295a33bb57a0a44e02ad993bfe4abe1acc353c2ad57e8/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e17b0188165ec85c86d059f4a278f73773af82086472c6fd3cfe1903ba72eba0/contract';
import startContract from '../../snapshots/e17b0188165ec85c86d059f4a278f73773af82086472c6fd3cfe1903ba72eba0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'navigationIntegrityAnomaly',
        columns: [
          col('affectedAircraftCount', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('altitudeBandsJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('baselineAircraftCount', 'int4', {
            notNull: true,
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('baselineMedianNacP', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('baselineMedianNacV', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('baselineMedianNic', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('cellKeysJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('confidence', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('endedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('evidenceJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastObservedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('medianNacP', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('medianNacV', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('medianNic', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('sampleCount', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('severity', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('startedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'navigationIntegrityObservation',
        columns: [
          col('adsbVersion', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('aircraftHex', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('altitudeBand', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('altitudeFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('confidence', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('dedupKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('flightId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('gva', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lat', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('latCell', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lon', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('lonCell', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('nacP', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('nacV', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('nic', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('observedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('positionSource', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provenanceJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('quality', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('receivedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('sda', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('sil', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'navigationIntegrityObservation',
        constraint: 'navigationIntegrityObservation_dedupKey_key',
        columns: ['dedupKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navigationIntegrityAnomaly',
        index: 'ni_anomaly_ended_idx',
        columns: ['endedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navigationIntegrityAnomaly',
        index: 'ni_anomaly_last_idx',
        columns: ['lastObservedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navigationIntegrityAnomaly',
        index: 'ni_anomaly_started_idx',
        columns: ['startedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navigationIntegrityObservation',
        index: 'ni_obs_aircraft_observed_idx',
        columns: ['aircraftHex', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navigationIntegrityObservation',
        index: 'ni_obs_altitude_observed_idx',
        columns: ['altitudeBand', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navigationIntegrityObservation',
        index: 'ni_obs_cell_observed_idx',
        columns: ['latCell', 'lonCell', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navigationIntegrityObservation',
        index: 'ni_obs_observed_idx',
        columns: ['observedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
