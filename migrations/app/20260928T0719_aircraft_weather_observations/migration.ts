#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/7e7ffb7e83373c67316fe3b66555da515e7da2d7bc47897560c65d38611de794/contract';
import startContract from '../../snapshots/7e7ffb7e83373c67316fe3b66555da515e7da2d7bc47897560c65d38611de794/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e17b0188165ec85c86d059f4a278f73773af82086472c6fd3cfe1903ba72eba0/contract';
import endContract from '../../snapshots/e17b0188165ec85c86d059f4a278f73773af82086472c6fd3cfe1903ba72eba0/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'aircraftWeatherObservation',
        columns: [
          col('aircraftHex', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('altitudeFt', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('altitudeType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('bdsConfidence', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('callsign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('dedupKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('flightId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('humidityPct', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('lat', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('lon', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('observedAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('provenanceJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('provider', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('quality', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('receivedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('staticAirTempC', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('staticPressureHpa', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('totalAirTempC', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('turbulenceLevel', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('weatherSourceQuality', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('windDirectionDeg', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('windSpeedKt', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'aircraftWeatherObservation',
        constraint: 'aircraftWeatherObservation_dedupKey_key',
        columns: ['dedupKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'aircraftWeatherObservation',
        index: 'aircraftWeatherObservation_aircraftHex_observedAt_idx_8b992898',
        columns: ['aircraftHex', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'aircraftWeatherObservation',
        index: 'aircraftWeatherObservation_altitudeFt_observedAt_idx_9a18aab5',
        columns: ['altitudeFt', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'aircraftWeatherObservation',
        index: 'aircraftWeatherObservation_lat_lon_observedAt_idx_dac48bf5',
        columns: ['lat', 'lon', 'observedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'aircraftWeatherObservation',
        index: 'aircraftWeatherObservation_observedAt_idx_980e226e',
        columns: ['observedAt'],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
