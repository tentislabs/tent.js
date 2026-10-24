import assert from 'node:assert/strict'
import { join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'
import { copyOf } from './copies.ts'

/** The findings of T3009 on a copy of a project of the rent app, as `name:code`. */
async function found(side: 'pass' | 'fail'): Promise<string[]> {
  const folder = copyOf(join('rentApp', side), `T3009-rent-${side}`)
  return (await checkRules(folder, {})).findings
    .filter((one) => one.code === 'T3009')
    .map((one) => `${one.where?.definition}:${one.code}`)
}

test('[15-1@9a] T3009: a change open to a caller that states system and changes a row named by its input, of a table whose rules would not let that caller change it, with no check of the caller against the row, is found also where the table has no rule of its own and where the change is open to a role', async () => {
  // The rent app, with the two checks by hand taken out: a renter may tell of any rent, a landlord mark any.
  assert.deepEqual((await found('fail')).sort(), ['markRent:T3009', 'tellPaid:T3009'])
  // With them in: a read of the row through the rules of the table, and a read of the home of the rent.
  assert.deepEqual(await found('pass'), [])
})
