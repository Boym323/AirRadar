#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/0f707820bb833a4886fc292b9003b82408bac10a51f03f7b2858123cd2b25409/contract';
import endContract from '../../snapshots/0f707820bb833a4886fc292b9003b82408bac10a51f03f7b2858123cd2b25409/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/e05c22fd90a750642d9e212984e8b9d0797d81c37a9754fb29eebf0e50c82a08/contract';
import startContract from '../../snapshots/e05c22fd90a750642d9e212984e8b9d0797d81c37a9754fb29eebf0e50c82a08/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'airportFrequency',
        columns: [
          col('airportId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('frequencyMhz', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('sourceAirportIdent', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'airportRunway',
        columns: [
          col('airportId', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('closed', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('heDisplacedThresholdFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('heElevationFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('heHeadingDegT', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('heIdent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('heLatitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('heLongitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('leDisplacedThresholdFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('leElevationFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('leHeadingDegT', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('leIdent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('leLatitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('leLongitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('lengthFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('lighted', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
          col('sourceAirportIdent', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('surface', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('widthFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'navaid',
        columns: [
          col('associatedAirportId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('associatedAirportIdent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('country', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('dmeChannel', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('dmeElevationFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('dmeFrequencyKhz', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('dmeLatitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('dmeLongitude', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('elevationFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('filename', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('frequencyKhz', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('id', 'int4', { notNull: true, codecRef: { codecId: 'pg/int4@1' } }),
          col('ident', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('latitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('longitude', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('magneticVariationDeg', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('power', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('slavedVariationDeg', 'float8', { codecRef: { codecId: 'pg/float8@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('usageType', 'text', { codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addColumn({
        schema: 'public',
        table: 'airport',
        column: col('elevationFt', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'airport',
        column: col('localCode', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'airport',
        column: col('ourAirportsId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'airport',
        column: col('ourAirportsIdent', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'airport',
        column: col('region', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'airport',
        column: col('scheduledService', 'bool', { codecRef: { codecId: 'pg/bool@1' } }),
      }),
      this.addColumn({
        schema: 'public',
        table: 'airport',
        column: col('type', 'text', { codecRef: { codecId: 'pg/text@1' } }),
      }),
      this.addUnique({
        schema: 'public',
        table: 'airport',
        constraint: 'airport_ourAirportsId_key',
        columns: ['ourAirportsId'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'airport',
        constraint: 'airport_ourAirportsIdent_key',
        columns: ['ourAirportsIdent'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'airport',
        index: 'airport_ourAirportsIdent_idx_b72bfeea',
        columns: ['ourAirportsIdent'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'airportFrequency',
        index: 'airportFrequency_airportId_frequencyMhz_idx_d45a97a4',
        columns: ['airportId', 'frequencyMhz'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'airportFrequency',
        index: 'airportFrequency_airportId_idx_63ab39d3',
        columns: ['airportId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'airportRunway',
        index: 'airportRunway_airportId_idx_63ab39d3',
        columns: ['airportId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navaid',
        index: 'navaid_associatedAirportId_idx_47ae9e2f',
        columns: ['associatedAirportId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navaid',
        index: 'navaid_country_idx_c3994778',
        columns: ['country'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navaid',
        index: 'navaid_ident_idx_b731c50f',
        columns: ['ident'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navaid',
        index: 'navaid_latitude_longitude_idx_cf6c2b2c',
        columns: ['latitude', 'longitude'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'navaid',
        index: 'navaid_type_idx_b6b604ea',
        columns: ['type'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'airportFrequency',
        foreignKey: {
          name: 'airportFrequency_airportId_fkey',
          columns: ['airportId'],
          references: { schema: 'public', table: 'airport', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'airportRunway',
        foreignKey: {
          name: 'airportRunway_airportId_fkey',
          columns: ['airportId'],
          references: { schema: 'public', table: 'airport', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'navaid',
        foreignKey: {
          name: 'navaid_associatedAirportId_fkey',
          columns: ['associatedAirportId'],
          references: { schema: 'public', table: 'airport', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
