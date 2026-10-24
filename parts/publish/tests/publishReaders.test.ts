import assert from 'node:assert/strict'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { test } from 'node:test'
import type { App } from '../../engine/index.ts'
import { createEngine } from '../../engine/index.ts'
import { publish } from '../index.ts'
import { closing, computer, fetched, folderOf, started } from './server.ts'

const system = { as: { kind: 'system' } } as const

/** Waits until something holds, and fails where it never does. */
async function until(what: string, holds: () => boolean | Promise<boolean>): Promise<void> {
  for (let n = 0; n < 2000; n++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

const running = (app: App): string | undefined => app.versions().find((one) => one.running)?.id

test('[29-11] a publish to a writer with two readers: both hold the version before the switch, apply its table changes, and serve the new version', async (t) => {
  const folder = folderOf(t)
  const server = await started(t, folder, { open: { insecure: true } })
  const here = computer(t, folder, 'here')
  const to = server.key(['read', 'push', 'publish'])
  await here.save()
  const first = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  await server.app.write([{ add: 'orders', values: { title: 'before', total: 1, state: 'open' } }], system)

  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const readers: App[] = []
  for (const [k, right] of [['copy'], ['far']].entries())
    readers.push(
      await engine.read({
        from: server.address,
        key: server.key(right).key,
        dataFolder: join(folder, `reader-${k + 1}`),
        insecure: true,
      }),
    )
  for (const reader of readers) await until('the reader runs what is live', () => running(reader) === first.version)

  // A version with a table change: the switch waits until both readers hold it.
  here.edit(
    'tables/orders.ts',
    '    note: text({ optional: true, max: NOTE_LENGTH }),',
    '    note: text({ optional: true, max: NOTE_LENGTH }),\n    rush: boolean({ default: false }),',
  )
  await here.save()
  const heldBefore: boolean[] = []
  server.engine.on('version.switched', (told) => {
    if (told.app === server.app)
      for (const reader of readers) heldBefore.push(reader.versions().some((one) => one.id === told.to))
  })
  const next = await publish({ project: here.project, history: here.history, to, fetch: fetched })
  assert.deepEqual(heldBefore, [true, true], 'both readers held the version when the writer switched')
  await server.app.write([{ add: 'orders', values: { title: 'after', total: 2, state: 'open', rush: true } }], system)
  for (const [k, reader] of readers.entries()) {
    await until('the reader serves the new version', () => running(reader) === next.version)
    // What the reader holds is read from its data file, to read alone: the reader answers a read of its own.
    const rowsOf = (): Record<string, unknown>[] => {
      const db = new DatabaseSync(join(folder, `reader-${k + 1}`, 'data.db'), { readOnly: true })
      try {
        return db.prepare('SELECT "title", "rush" FROM "orders"').all()
      } catch {
        return []
      } finally {
        db.close()
      }
    }
    await until('the reader holds the write after the switch', () => rowsOf().length === 2)
    const rows = rowsOf()
    assert.deepEqual(
      rows.map((row) => [row.title, Number(row.rush) === 1]).sort(),
      [
        ['after', true],
        ['before', false],
      ],
      'the table change was applied on the reader',
    )
  }
})
