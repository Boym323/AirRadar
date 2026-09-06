#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/101bdf9f149189688df883b35cc40eac9dc12f98ea8d70310be798f8c52ff7c0/contract';
import endContract from '../../snapshots/101bdf9f149189688df883b35cc40eac9dc12f98ea8d70310be798f8c52ff7c0/contract.json' with { type: 'json' };
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
          col('manufacturer', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('model', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('operator', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('registration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('registrationCountry', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('registrationCountryCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
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
        table: 'airport',
        columns: [
          col('city', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('country', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('iata', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('icao', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
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
        table: 'atcSector',
        columns: [
          col('alternateFrequenciesJson', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('atcCallsign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('country', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lowerAltitudeFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('polygonJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('primaryFrequencyMhz', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('service', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('source', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('upperAltitudeFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('validFrom', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('validTo', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'atcTransmitter',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('frequencyMhz', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('notes', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('service', 'text', { codecRef: { codecId: 'pg/text@1' } }),
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
          col('aircraftType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('airline', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('callsign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('destination', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('endTime', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('id', 'SERIAL', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('instanceKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastSeenAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('maxAltitude', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('minDistanceKm', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('origin', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('registration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
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
      this.addUnique({
        schema: 'public',
        table: 'airport',
        constraint: 'airport_icao_key',
        columns: ['icao'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'flight',
        constraint: 'flight_instanceKey_key',
        columns: ['instanceKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'airport',
        index: 'airport_country_idx_c3994778',
        columns: ['country'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'airport',
        index: 'airport_iata_idx_824cf92a',
        columns: ['iata'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'atcSector',
        index: 'atcSector_country_idx_c3994778',
        columns: ['country'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'atcSector',
        index: 'atcSector_validFrom_validTo_idx_705b270a',
        columns: ['validFrom', 'validTo'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'flight',
        index: 'flight_aircraftId_endTime_lastSeenAt_idx_ae25d43c',
        columns: ['aircraftId', 'endTime', 'lastSeenAt'],
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
      this.createIndex({
        schema: 'public',
        table: 'flightPosition',
        index: 'flightPosition_recordedAt_idx_fd5b4732',
        columns: ['recordedAt'],
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
