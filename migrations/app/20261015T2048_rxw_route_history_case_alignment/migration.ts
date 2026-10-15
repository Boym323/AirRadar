#!/usr/bin/env -S node
import type { Contract as Start } from '../../snapshots/1b47349b9d370927a9991a63fe992dd054ae3f243e5e921fd76d0bba867c3265/contract';
import startContract from '../../snapshots/1b47349b9d370927a9991a63fe992dd054ae3f243e5e921fd76d0bba867c3265/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/e62cfb5f2bd262676d9493c1a5573c72c9a877b4766f6e853569788b3252db13/contract';
import endContract from '../../snapshots/e62cfb5f2bd262676d9493c1a5573c72c9a877b4766f6e853569788b3252db13/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      rawSql({
        id: 'schema.rxwRouteSnapshot.case_alignment',
        label: 'Verify RXW route history table name alignment',
        operationClass: 'additive',
        target: { id: 'postgres', details: { schema: 'public', objectType: 'table', name: 'RxwRouteSnapshot' } },
        precheck: [{
          description: 'Verify the existing RXW route history table uses the mapped production name',
          sql: 'SELECT (to_regclass($1)) IS NOT NULL AS "result"',
          params: ['"public"."RxwRouteSnapshot"'],
        }],
        execute: [],
        postcheck: [{
          description: 'Verify the mapped RXW route history table remains present',
          sql: 'SELECT (to_regclass($1)) IS NOT NULL AS "result"',
          params: ['"public"."RxwRouteSnapshot"'],
        }],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
