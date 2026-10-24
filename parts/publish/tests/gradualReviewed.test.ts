import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Caller } from '../../core/index.ts'
import { publish } from '../index.ts'
import { computer, fetched, folderOf, started } from './server.ts'

/** A caller of the tests, by its number: a signed-in user whose id the release reads. */
const user = (n: number): Caller => ({ kind: 'user', user: { id: `u${String(n).padStart(4, '0')}`, roles: [] } })

/** A query of the shop that reads the column `gift` of its orders, which the second version adds. */
const gifts = `import { query } from 'tentjs'
import { orders } from '../tables/orders'

export const gifts = query('gifts', { access: 'signedIn', rows: orders.where({ gift: true }).limit(10) })
`

test('[44-3] a gradual release of a version that adds a column serves its share of the callers on one data, the column there', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  here.edit('tent.ts', "title: 'Shop' }", "title: 'Shop', release: { steps: [0.5, 1], every: '1 hour' } }")
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched, acceptImpact: true })
  // The second version adds a column and a query that reads it: an added column goes gradually, by 44, section 3.
  here.edit(
    'tables/orders.ts',
    '    paid: boolean({ default: false }),',
    '    paid: boolean({ default: false }),\n    gift: boolean({ default: false }),',
  )
  writeFileSync(join(here.project, 'functions', 'gifts.ts'), gifts)
  await here.save()
  const released = await publish({
    project: here.project,
    history: here.history,
    to,
    fetch: fetched,
    gradual: true,
    acceptImpact: true,
  })
  const onNew: number[] = []
  for (let n = 0; n < 40; n++)
    try {
      await server.app.call('gifts', {}, { as: user(n) })
      onNew.push(n)
    } catch (error) {
      // The old version knows no query `gifts`: its callers are T0001 there.
      const code = String(Object(error).code)
      if (code !== 'T0001')
        assert.fail(`a caller of the new version ${released.version} was answered ${code}: ${String(error)}`)
    }
  assert.ok(onNew.length > 0, 'some callers are given the new version')
})
