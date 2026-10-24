import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { publish } from '../index.ts'
import { computer, fetched, folderOf, started } from './server.ts'

type Message = Record<string, unknown>

const tables = 'tables/orders.ts'

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
async function until(what: string, holds: () => boolean): Promise<void> {
  for (let n = 0; n < 1500 && !holds(); n++) await new Promise((done) => setTimeout(done, 10))
  assert.equal(holds(), true, `never: ${what}`)
}

test('[40-6] a page kept open across five publishes, one of them a column removal, shows no error: it keeps working or is told to reload', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder)
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  writeFileSync(
    join(here.project, 'functions', 'listed.ts'),
    "import { anyone, query } from 'tentjs'\nimport { orders } from '../tables/orders'\n\nexport const listed = query('listed', { access: anyone('a page of the tests'), rows: orders.limit(10) })\n",
  )
  await here.save()
  const first = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  await server.app.write([{ add: 'orders', values: { title: 'one', total: 5, state: 'open' } }], { as: 'system' })

  // A page drawn of the first version, which holds its live connection open.
  const origin = `http://localhost:${new URL(server.address).port}`
  const end = server.app.live(new Request(`${origin}/_t/live`, { headers: { origin } }))
  const got: Message[] = []
  end.each(
    (message) => {
      if (message.t === 'alive') end.send({ t: 'alive' })
      else got.push(message)
    },
    () => undefined,
  )
  let version = first.version
  let watched = 0
  const watch = async (): Promise<Message> => {
    const id = `w${watched++}`
    end.send({ t: 'watch', id, query: 'listed', input: {}, version })
    await until(`the watch ${id} is answered`, () => got.some((one) => one.id === id))
    return got.find((one) => one.id === id) ?? {}
  }
  assert.equal((await watch()).t, 'result')

  const edits: [string, string][] = [
    [
      '    note: text({ optional: true, max: NOTE_LENGTH }),',
      '    note: text({ optional: true, max: NOTE_LENGTH }),\n    rush: boolean({ optional: true }),',
    ],
    [
      '    rush: boolean({ optional: true }),',
      '    rush: boolean({ optional: true }),\n    late: boolean({ optional: true }),',
    ],
    ['    rush: boolean({ optional: true }),\n', ''],
    [
      '    late: boolean({ optional: true }),',
      '    late: boolean({ optional: true }),\n    gift: boolean({ optional: true }),',
    ],
    [
      '    gift: boolean({ optional: true }),',
      '    gift: boolean({ optional: true }),\n    wrapped: boolean({ optional: true }),',
    ],
  ]
  for (const [from, into] of edits) {
    here.edit(tables, from, into)
    if (into === '') here.edit(tables, '  access: { read:', "  removed: ['rush'],\n  access: { read:")
    await here.save()
    const next = await publish({ project: here.project, history: here.history, to, fetch: fetched })
    // The page goes on with its own version, or it was told to reload and follows the one that runs.
    const told = got.some((one) => one.t === 'reload')
    if (told) {
      version = next.version
      got.length = 0
    }
    const answer = await watch()
    assert.equal(answer.t, 'result', `after the publish of ${next.version}: ${JSON.stringify(answer)}`)
  }
  assert.deepEqual(
    got.filter((one) => one.t === 'failed' || one.t === 'error'),
    [],
  )
  end.close()
})
