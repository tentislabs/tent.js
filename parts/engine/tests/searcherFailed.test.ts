import assert from 'node:assert/strict'
import test from 'node:test'
import type { Searcher } from '../index.ts'
import { logRows, running, system } from './apps.ts'
import { untilTried } from './watching.ts'

test('[22-20] a search of the builder that throws on a committed write: the write is answered as done, and the log names the search and the number of the write', async (t) => {
  let failing = true
  const told: string[] = []
  const searcher: Searcher = {
    has: () => true,
    wrote(_table, _id, texts) {
      if (failing) throw new Error('the search is down')
      told.push(String(texts?.name))
    },
    find: () => [],
  }
  const run = await running(t, {
    // The tags are searched by their names, so a write of a tag is told to the search.
    change: (description) => Object.assign(Object(description.tables.tags), { search: ['name'] }),
    engine: { makers: { search: () => searcher } },
  })
  const written = await run.app.write([{ add: 'tags', values: { name: 'first' } }], { as: system })
  assert.ok(Array.isArray(written), 'the write is answered as done')
  const failed = () =>
    logRows(run.dataFolder, 'lines').filter((line) => String(line.message).startsWith('The search of the app failed'))
  await untilTried('the log says the search failed', () => failed().length > 0)
  const [line] = failed()
  assert.equal(line.level, 'error')
  const data = JSON.parse(String(line.data))
  assert.equal(data.searcher, 'search')
  assert.equal(typeof data.n, 'number')
  assert.equal(data.error, 'the search is down')
  failing = false
  assert.deepEqual(told, [], 'the search rests before it is handed the write again')
  await run.app.close()
})
