import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import { computer, fetched, folderOf, started } from './server.ts'

const moment = (ms = 50): Promise<void> => new Promise((done) => setTimeout(done, ms))

// The work that fills the summary of an order, in a file of its own so that a change of it changes that work alone.
const work = (words: string): string =>
  [
    "import { action, text } from 'tentjs'",
    '',
    "export const summarize = action('summarize', {",
    "  access: 'nobody',",
    "  system: 'fills the summary of an order from its title',",
    '  input: { title: text() },',
    '  output: text(),',
    `  run: async ({ input }) => \`${words} \${input.title}\`,`,
    '})',
    '',
  ].join('\n')

test('[51-9] tent publish says how many values a changed work makes old, with perDay of its by, or that it states none', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  writeFileSync(join(here.project, 'functions', 'summary.ts'), work('an order:'))
  here.edit(
    'tables/orders.ts',
    "import { boolean, choice, number, table, text } from 'tentjs'",
    "import { boolean, choice, number, table, text } from 'tentjs'\nimport { summarize } from '../functions/summary'",
  )
  here.edit(
    'tables/orders.ts',
    'note: text({ optional: true, max: NOTE_LENGTH }),',
    "note: text({ optional: true, max: NOTE_LENGTH }),\n    summary: text({ optional: true, by: { work: summarize, debounce: '1 second', limits: { perDay: { calls: 500 } } } }),",
  )
  here.edit(
    'tables/orders.ts',
    '    name: text(),\n    city: text({ optional: true }),',
    "    name: text(),\n    city: text({ optional: true }),\n    short: text({ optional: true, by: { work: summarize, input: { title: 'name' }, debounce: '1 second' } }),",
  )
  await here.save()
  await publish({ project: here.project, history: here.history, to, fetch: fetched })
  for (let i = 0; i < 3; i++)
    await server.app.write([{ add: 'orders', values: { title: `order ${i}`, total: i, state: 'open' } }], {
      as: 'system',
    })
  await server.app.write([{ add: 'clients', values: { name: 'Ann' } }], { as: 'system' })
  for (let i = 0; i < 200; i++) {
    const counts = server.app.filled()
    if (counts.length === 2 && counts.every((one) => one.missing === 0 && one.old === 0)) break
    await moment()
  }
  assert.deepEqual(
    server.app
      .filled()
      .map((one) => [one.table, one.column, one.missing])
      .sort(),
    [
      ['clients', 'short', 0],
      ['orders', 'summary', 0],
    ],
  )
  writeFileSync(join(here.project, 'functions', 'summary.ts'), work('the order'))
  await here.save()
  const tried = await publish({ project: here.project, history: here.history, to, fetch: fetched, try: true })
  assert.deepEqual(
    [...(tried.old ?? [])].sort((a, b) => a.table.localeCompare(b.table)),
    [
      { table: 'clients', column: 'short', old: 1 },
      { table: 'orders', column: 'summary', old: 3, perDay: { calls: 500 } },
    ],
  )
  const done = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.deepEqual(done.old?.map((one) => one.old).sort(), [1, 3])
})
