import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Impact } from '../index.ts'
import { impactOf } from '../index.ts'
import { computer, describedNow, folderOf } from './server.ts'

const functions = 'functions/orders.ts'

// A screen and a component that read the open orders by their data, and a screen whose form calls the refund.
const files: Record<string, string> = {
  'screens/open.tsx': `import { read, screen } from 'tentjs/ui'
import { openOrders } from '../functions/orders'

export const openScreen = screen('openScreen', {
  path: '/open',
  access: 'signedIn',
  data: { orders: read(openOrders, { limit: 10 }) },
  view: ({ orders }) => (
    <ul>
      {orders.map((one) => (
        <li key={one.id}>{one.title}</li>
      ))}
    </ul>
  ),
})
`,
  'components/OpenCount.tsx': `import { component, read } from 'tentjs/ui'
import { openOrders } from '../functions/orders'

export const OpenCount = component('OpenCount', {
  data: { orders: read(openOrders, { limit: 100 }) },
  view: ({ orders }) => <span>{orders.length}</span>,
})
`,
  'screens/refund.tsx': `import { Form, screen } from 'tentjs/ui'
import { refund } from '../functions/orders'

export const refundScreen = screen('refundScreen', {
  path: '/refund',
  access: 'signedIn',
  view: () => (
    <Form id="refund" call={refund}>
      <input name="order" />
      <button type="submit">Refund</button>
    </Form>
  ),
})
`,
}

type Tree = Impact['reaches'][number]['tree']

/** Every name a tree of what is reached holds, at any depth. */
const namesIn = (tree: Tree): string[] => tree.flatMap((one) => [one.name, ...namesIn(one.under)])

test('[44-2] the impact of a change to a project as the build describes it reaches the screens and the components that read a changed function by their data, and the screens that call it', async (t) => {
  const here = computer(t, folderOf(t), 'here')
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(here.project, path, '..'), { recursive: true })
    writeFileSync(join(here.project, path), text)
  }
  const live = await describedNow(here.project)

  // Both functions are changed: each may now be called by anyone.
  for (const name of ["query('openOrders'", "action('refund'"])
    here.edit(
      functions,
      `export const ${name.split("'")[1]} = ${name}, {\n  access: 'signedIn',`,
      `export const ${name.split("'")[1]} = ${name}, {\n  access: anyone('a test widens it'),`,
    )
  here.edit(
    functions,
    "import { action, change, input, number, query, text } from 'tentjs'",
    "import { action, anyone, change, input, number, query, text } from 'tentjs'",
  )
  const next = await describedNow(here.project)

  const impact = impactOf({ against: 'live', live, next })
  const reached = (name: string): string[] =>
    namesIn(impact.reaches.find((one) => one.name === name)?.tree ?? []).sort()
  assert.deepEqual(reached('openOrders'), ['OpenCount', 'openScreen'])
  assert.deepEqual(reached('refund'), ['refundScreen'])
})
