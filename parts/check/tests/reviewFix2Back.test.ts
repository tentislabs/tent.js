import assert from 'node:assert/strict'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { checkRules } from '../ours.ts'

// A change written with `run` that answers a record and states no `output`.
const orders = `import { change, number, table, text } from 'tentjs'

export const orders = table('orders', { columns: { status: text(), total: number() } })

export const addOrder = change('addOrder', {
  access: 'signedIn',
  input: { total: number() },
  run: ({ db, input }) => {
    const made = db.orders.add({ status: 'open', total: input.total })
    return { id: made.id, status: made.status }
  },
})
`

/** Takes a name and the files of a project beside `functions/orders.ts`. Writes the project, and answers its folder. */
function projectWith(name: string, files: Record<string, string>): string {
  const folder = join(import.meta.dirname, '..', '..', '..', 'results', 'check', `review-fix2-${name}`)
  rmSync(folder, { recursive: true, force: true })
  const all: Record<string, string> = {
    'tent.ts': "import { project } from 'tentjs'\n\nexport const shop = project('shop', { title: 'Shop' })\n",
    'functions/orders.ts': orders,
    ...files,
  }
  for (const [path, text] of Object.entries(all)) {
    mkdirSync(dirname(join(folder, path)), { recursive: true })
    writeFileSync(join(folder, path), text)
  }
  return folder
}

/** A screen whose view uses `useCall(addOrder)` as `pay`, with the body of the view after it. */
const screenWith = (view: string): Record<string, string> => ({
  'screens/pay.tsx': `import { screen, useCall } from 'tentjs/ui'
import { addOrder } from '../functions/orders'

export const payScreen = screen('payScreen', {
  path: '/pay',
  access: 'signedIn',
  view: () => {
    const pay = useCall(addOrder)
${view}
  },
})
`,
})

/** An action whose `run` holds these lines, which call `addOrder`. */
const actionWith = (lines: string): Record<string, string> => ({
  'functions/shop.ts': `import { action } from 'tentjs'
import { addOrder } from './orders'

export const orderMany = action('orderMany', {
  access: 'signedIn',
  input: {},
  run: async () => {
${lines}
  },
})
`,
})

/** Whether the check finds T7009 at the change of a project. */
const foundAtChange = async (folder: string): Promise<boolean> =>
  (await checkRules(folder)).findings.some((one) => one.code === 'T7009' && one.where?.file === 'functions/orders.ts')

// `hook.useCall` reads the answer as `await pay.call(input)` and as `pay.value`: both take what the change answers.
const taking = {
  // The one form the check finds today, which holds that the project is read.
  'value-destructured': screenWith(`    const { value } = useCall(addOrder)
    console.log(pay.busy)
    return <p>{String(Object(value).id)}</p>`),
  'call-awaited': screenWith(`    const press = async () => {
      const order = await pay.call({ total: 1 })
      console.log('paid', order)
    }
    return <button type="button" onClick={press}>Pay</button>`),
  'value-read': screenWith(`    return (
      <div>
        <button type="button" onClick={() => pay.call({ total: 1 })}>Pay</button>
        <p>{String(Object(pay.value).id)}</p>
      </div>
    )`),
}

// Calls of the change whose answers no code takes: each is a statement of its own.
const leaving = {
  'all-awaited': actionWith('    await Promise.all([1, 2].map((total) => addOrder({ total })))'),
  'for-each': actionWith('    ;[3, 4].forEach((total) => addOrder({ total }))'),
}

test('[15-1] T7009 holds a change written with `run` and no `output` whose answer a view takes from `useCall`, as `hook.useCall` reads it: by `await pay.call(...)` and by `pay.value`', async () => {
  const missed: string[] = []
  for (const [name, files] of Object.entries(taking))
    if (!(await foundAtChange(projectWith(name, files)))) missed.push(name)
  assert.deepEqual(missed, [])
})

test('[15-1] T7009 passes a change written with `run` and no `output` whose answer no code takes: calls of it in `Promise.all` and `forEach` that are statements of their own', async () => {
  const found: string[] = []
  for (const [name, files] of Object.entries(leaving))
    if (await foundAtChange(projectWith(name, files))) found.push(name)
  assert.deepEqual(found, [])
})
