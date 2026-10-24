import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { Caller } from '../../core/index.ts'
import { appIn } from './desks.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

test('[45-19.3] a kept count tells how many linked rows there are to whoever reads its row, as its page says, and a read rule on the column hides it', async (t) => {
  const folder = copyOf(t, 'counted')
  const tables = join(folder, 'tables', 'customers.ts')
  writeFileSync(
    tables,
    readFileSync(tables, 'utf8')
      .replace(
        "import { anyone, count, max, min, number, sum, table, text } from 'tentjs'",
        "import { anyone, count, max, min, number, role, sum, table, text } from 'tentjs'",
      )
      .replace(
        "openOrders: number({ from: count({ of: orders, by: 'customer', where: { status: 'open' } }) }),",
        "openOrders: number({ from: count({ of: orders, by: 'customer', where: { status: 'open' } }) }),\n    allOrders: number({ from: count({ of: orders, by: 'customer' }), read: role('staff') }),",
      )
      .concat(
        "\nexport const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: open } })\n",
      )
      .replace('role, sum', 'list, role, sum'),
  )
  const { app } = await appIn(t, folder)
  const customer = String(Reflect.get(Object(await app.call('addCustomer', { name: 'Ada' }, system)), 'id'))
  await app.call('addOrder', { customer, total: 5, status: 'open' }, system)
  const plain = await app.user({ name: 'Pia', roles: [] })
  const staff = await app.user({ name: 'Sam', roles: ['staff'] })
  const read = async (as: Caller) => Object(await app.read({ from: 'customers', one: 'get', id: customer }, { as }))
  assert.equal((await read(plain)).openOrders, 1, 'a fact of the row it stands on')
  assert.equal('allOrders' in (await read(plain)), false, 'a read rule on the column hides it')
  assert.equal((await read(staff)).allOrders, 1)
  const page = readFileSync(join(import.meta.dirname, '..', '..', 'docs', 'pages', 'word.count.md'), 'utf8')
  assert.match(page, /also those the reader may not read/)
})
