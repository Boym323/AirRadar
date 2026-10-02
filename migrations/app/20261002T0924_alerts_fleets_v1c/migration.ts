#!/usr/bin/env -S node
import type { Contract as End } from '../../snapshots/7f3f38d07c5ff5c4fe85cc8c52ee2cdd0356e3ed349659d2a8e9b0586cd2b6ba/contract';
import endContract from '../../snapshots/7f3f38d07c5ff5c4fe85cc8c52ee2cdd0356e3ed349659d2a8e9b0586cd2b6ba/contract.json' with { type: 'json' };
import type { Contract as Start } from '../../snapshots/a31a5aa55d41de3fca5295a33bb57a0a44e02ad993bfe4abe1acc353c2ad57e8/contract';
import startContract from '../../snapshots/a31a5aa55d41de3fca5295a33bb57a0a44e02ad993bfe4abe1acc353c2ad57e8/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, fn, lit, primaryKey } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.createTable({
        schema: 'public',
        table: 'alertDelivery',
        columns: [
          col('attemptCount', 'int4', {
            notNull: true,
            default: lit(0),
            codecRef: { codecId: 'pg/int4@1' },
          }),
          col('channel', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('claimedAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('lastError', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('nextAttemptAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('occurrenceId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sentAt', 'timestamptz', { codecRef: { codecId: 'pg/timestamptz-temporal@1' } }),
          col('status', 'text', {
            notNull: true,
            default: lit('PENDING'),
            codecRef: { codecId: 'pg/text@1' },
          }),
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
        table: 'alertFleet',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('description', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
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
        table: 'alertFleetMatcher',
        columns: [
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('fleetId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('type', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('value', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'alertGeofence',
        columns: [
          col('centerLat', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('centerLon', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('radiusMeters', 'float8', { notNull: true, codecRef: { codecId: 'pg/float8@1' } }),
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
        table: 'alertOccurrence',
        columns: [
          col('aircraftIcao', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('callsign', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('flightEventId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('flightId', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('geofenceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('occurredAt', 'timestamptz', {
            notNull: true,
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('payloadJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('registration', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('ruleId', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceKey', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('sourceType', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('trigger', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.createTable({
        schema: 'public',
        table: 'alertRule',
        columns: [
          col('activatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('channelsJson', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('cooldownMs', 'int4', { codecRef: { codecId: 'pg/int4@1' } }),
          col('createdAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
          col('enabled', 'bool', {
            notNull: true,
            default: lit(true),
            codecRef: { codecId: 'pg/bool@1' },
          }),
          col('fleetId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('geofenceId', 'text', { codecRef: { codecId: 'pg/text@1' } }),
          col('id', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('name', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('targetKind', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('trigger', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('triggerConfig', 'text', { notNull: true, codecRef: { codecId: 'pg/text@1' } }),
          col('updatedAt', 'timestamptz', {
            notNull: true,
            default: fn('now()'),
            codecRef: { codecId: 'pg/timestamptz-temporal@1' },
          }),
        ],
        constraints: [primaryKey(['id'])],
      }),
      this.addUnique({
        schema: 'public',
        table: 'alertDelivery',
        constraint: 'alertDelivery_occurrenceId_channel_key',
        columns: ['occurrenceId', 'channel'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'alertFleetMatcher',
        constraint: 'alertFleetMatcher_fleetId_type_value_key',
        columns: ['fleetId', 'type', 'value'],
      }),
      this.addUnique({
        schema: 'public',
        table: 'alertOccurrence',
        constraint: 'alertOccurrence_ruleId_sourceType_sourceKey_key',
        columns: ['ruleId', 'sourceType', 'sourceKey'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertDelivery',
        index: 'alertDelivery_claimedAt_idx_622598dc',
        columns: ['claimedAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertDelivery',
        index: 'alertDelivery_occurrenceId_idx_9f58affe',
        columns: ['occurrenceId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertDelivery',
        index: 'alertDelivery_status_nextAttemptAt_idx_8ba20615',
        columns: ['status', 'nextAttemptAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertFleetMatcher',
        index: 'alertFleetMatcher_fleetId_enabled_idx_57625a71',
        columns: ['fleetId', 'enabled'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertFleetMatcher',
        index: 'alertFleetMatcher_fleetId_idx_dce13b35',
        columns: ['fleetId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertOccurrence',
        index: 'alertOccurrence_aircraftIcao_occurredAt_idx_aef33eed',
        columns: ['aircraftIcao', 'occurredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertOccurrence',
        index: 'alertOccurrence_occurredAt_idx_c6b89167',
        columns: ['occurredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertOccurrence',
        index: 'alertOccurrence_ruleId_idx_05e770f7',
        columns: ['ruleId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertOccurrence',
        index: 'alertOccurrence_trigger_occurredAt_idx_733f52c6',
        columns: ['trigger', 'occurredAt'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertRule',
        index: 'alertRule_enabled_idx_7f014af8',
        columns: ['enabled'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertRule',
        index: 'alertRule_fleetId_idx_dce13b35',
        columns: ['fleetId'],
      }),
      this.createIndex({
        schema: 'public',
        table: 'alertRule',
        index: 'alertRule_geofenceId_idx_28366201',
        columns: ['geofenceId'],
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'alertDelivery',
        foreignKey: {
          name: 'alertDelivery_occurrenceId_fkey',
          columns: ['occurrenceId'],
          references: { schema: 'public', table: 'alertOccurrence', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'alertFleetMatcher',
        foreignKey: {
          name: 'alertFleetMatcher_fleetId_fkey',
          columns: ['fleetId'],
          references: { schema: 'public', table: 'alertFleet', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'alertOccurrence',
        foreignKey: {
          name: 'alertOccurrence_ruleId_fkey',
          columns: ['ruleId'],
          references: { schema: 'public', table: 'alertRule', columns: ['id'] },
          onDelete: 'cascade',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'alertRule',
        foreignKey: {
          name: 'alertRule_fleetId_fkey',
          columns: ['fleetId'],
          references: { schema: 'public', table: 'alertFleet', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
      this.addForeignKey({
        schema: 'public',
        table: 'alertRule',
        foreignKey: {
          name: 'alertRule_geofenceId_fkey',
          columns: ['geofenceId'],
          references: { schema: 'public', table: 'alertGeofence', columns: ['id'] },
          onDelete: 'setNull',
        },
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
