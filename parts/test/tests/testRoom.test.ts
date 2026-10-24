import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { testApp } from '../index.ts'

/**
 * A project of the test whose query writes a mark of its own on `globalThis` where it runs, and answers that it did.
 * The mark is written by the call and not at the top of the module, which the build loads in this program too.
 */
function marked(t: TestContext): { folder: string; mark: string } {
  const all = join(process.cwd(), 'results', 'test')
  mkdirSync(all, { recursive: true })
  const folder = mkdtempSync(join(all, 'room-'))
  t.after(() => rmSync(folder, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 }))
  const mark = `tentRoomMark${Math.random().toString(36).slice(2)}`
  writeFileSync(
    join(folder, 'tent.ts'),
    `import { project } from 'tentjs'\nexport const roomed = project('roomed', { title: 'Roomed' })\n`,
  )
  writeFileSync(
    join(folder, 'functions.ts'),
    `import { anyone, boolean, query } from 'tentjs'
export const marked = query('marked', { access: anyone('every visitor'), output: boolean(), run: () => Reflect.set(globalThis, ${JSON.stringify(mark)}, true) })
`,
  )
  return { folder, mark }
}

test('[52-1] a test app opened with `room: apart` runs its code in the test room: the engine holds no mark of its code, while its calls answer', async (t) => {
  const { folder, mark } = marked(t)
  const app = await testApp({ folder, room: 'apart' })
  t.after(() => app.close())
  assert.equal(await app.as('nobody').call('marked', {}), true, 'the code wrote its mark in its room')
  assert.equal(Reflect.get(globalThis, mark), undefined, 'the engine holds no mark of the call')
})

test('[52-1] a test app opened with no room asked for runs its code in the room of the program, unless the run states `TENT_ROOM=apart`', async (t) => {
  const { folder, mark } = marked(t)
  t.after(() => Reflect.deleteProperty(globalThis, mark))
  const app = await testApp({ folder })
  t.after(() => app.close())
  assert.equal(await app.as('nobody').call('marked', {}), true)
  assert.equal(
    Reflect.get(globalThis, mark),
    process.env.TENT_ROOM === 'apart' ? undefined : true,
    'the room is the one the run states',
  )
})
