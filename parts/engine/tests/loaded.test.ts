import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { bundled, workFolder } from './apps.ts'

const program = fileURLToPath(new URL('./loaded/program.ts', import.meta.url))

/** Opens an app in a program of its own, and answers what that program said of itself and of the files it loaded. */
async function saidBy(
  t: TestContext,
  how: 'alone' | 'readers' | 'lease' | 'kept' | 'near' | 'took' | 'back',
): Promise<Record<string, unknown>> {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  // The runner skips every file when it finds this in what it is handed, as it is when a test starts a program.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const out = execFileSync(process.execPath, [program, bundle.folder, join(work, 'data'), how], {
    env,
    encoding: 'utf8',
    timeout: 120_000,
  })
  return Object(JSON.parse(/^said: (.*)$/m.exec(out)?.[1] ?? '{}'))
}

test('[29-2] an app that was opened with no own, no readers and no reads loads nothing of the link between machines and nothing of the borrowed WebSocket part, whatever it is asked', async (t) => {
  const said = await saidBy(t, 'alone')
  assert.equal(said.engine, true, 'the program tells of the files it loads')
  // The app answered as an app on one machine does.
  assert.deepEqual(Object(said.read).length, 1)
  assert.deepEqual(Object(said.called).length, 1)
  assert.deepEqual([said.asked, said.health], [200, 200])
  assert.deepEqual([said.link, said.versions, said.made], [404, 404, 404])
  assert.equal(said.role, 'writer')
  const at = Object(said.at)
  assert.deepEqual([at.n > 0, at.settled, at.current], [true, at.n, true])
  assert.match(String(at.epoch), /^1\.[0-9a-z]{26}$/)
  const machines: Record<string, unknown>[] = Object(said.machines)
  assert.deepEqual(
    machines.map((one) => [one.role, one.far, one.take, one.n, one.current]),
    [['writer', false, true, at.n, true]],
  )
  assert.deepEqual(said.loaded, [])
})

test('[29-2] a writer that lets readers join loads the files of the link when it opens, and the borrowed WebSocket part at the first link and never before', async (t) => {
  const said = await saidBy(t, 'readers')
  const [before, after]: string[][] = [Object(said.before), Object(said.after)]
  assert.equal(said.machines, 2)
  assert.ok(before.includes('copy/writer.ts'), 'the writer is loaded for an app with readers')
  assert.deepEqual(
    before.filter((file) => !file.startsWith('copy/')),
    [],
  )
  assert.ok(after.includes('borrowed/ws.ts'), 'the wrapper is loaded at the first link')
  assert.ok(
    after.some((file) => file.startsWith('ws/')),
    'the borrowed part is loaded at the first link',
  )
})

/** Holds that a program loaded the files of the link between machines, and nothing of the borrowed WebSocket part. */
function holdsTheLink(loaded: unknown, what: string): void {
  const files: string[] = Object(loaded)
  for (const file of ['copy/machine.ts', 'copy/writer.ts'])
    assert.ok(files.includes(file), `${file} is loaded for ${what}`)
  assert.deepEqual(
    files.filter((file) => !file.startsWith('copy/')),
    [],
    `no link was opened for ${what}`,
  )
}

test('[29-2] an app that has a Lease loads the link between machines, though it was opened with no own, no readers and no reads', async (t) => {
  const said = await saidBy(t, 'lease')
  assert.equal(said.role, 'writer')
  holdsTheLink(said.after, 'an app with a lease')
  assert.ok(Object(said.after).includes('copy/lease.ts'), 'the lease is asked')
})

for (const [how, what] of [
  ['kept', 'keeps its changes'],
  ['near', 'names a near reader that may be current'],
  ['took', 'took over from another machine'],
  ['back', 'stands back for a reader'],
] as const)
  test(`[29-2] an app whose data says that it ${what} loads the link between machines, though it was opened with no own, no readers and no reads`, async (t) => {
    const said = await saidBy(t, how)
    // While it ran alone, and while its data was written by hand, the program loaded nothing of the link.
    assert.deepEqual([said.before, said.between], [[], []])
    assert.equal(said.role, 'writer')
    holdsTheLink(said.after, `data that says ${how}`)
  })
