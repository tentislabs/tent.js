import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const
const key = 'k'.repeat(40)

test('[29-7] the id of a row that a machine makes after it took over lies above every id that it applied, though its clock stands a day behind the clock of the writer it followed', async (t) => {
  // The machines beat five times a second, so that the reader knows within a second that its writer is gone.
  const project = copyOf(t, 'many')
  const tent = join(project, 'tent.ts')
  writeFileSync(
    tent,
    readFileSync(tent, 'utf8').replace(
      "{ title: 'Many machines' }",
      "{ title: 'Many machines', limits: { beat: '200 ms', behind: '1 second' } }",
    ),
  )
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const work = join(dirname(project), 'machines')
  const engine = createEngine({ port: 0 })
  // The reader is a program of its own: the maker of ids is one for a program, and reads the time of the system.
  const started: { reader?: ChildProcess; code?: number | null } = {}
  t.after(async () => {
    const { reader } = started
    if (reader && !('code' in started)) {
      const gone = new Promise((done) => reader.once('exit', done))
      reader.kill()
      await gone
    }
    await engine.close()
  })
  const writer = await engine.open(built.bundleFolder, {
    dataFolder: join(work, 'writer'),
    mode: 'test',
    readers: [key],
    insecure: true,
  })
  await writer.call('addOrder', { title: 'before the reader joined' }, system)
  const { port } = JSON.parse(readFileSync(join(work, 'writer', 'engine.json'), 'utf8'))
  const program = join(import.meta.dirname, 'taking', 'ids.ts')
  // The runner carries out no file for a program that it finds this in, as it would in a test that a test started.
  const { NODE_TEST_CONTEXT: _, ...env } = process.env
  const reader = spawn(process.execPath, [program, `http://127.0.0.1:${port}`, key, join(work, 'reader')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  started.reader = reader
  let out = ''
  for (const stream of [reader.stdout, reader.stderr])
    stream.setEncoding('utf8').on('data', (text: string) => {
      out += text
    })
  const exited = new Promise<void>((done) =>
    reader.once('exit', (code) => {
      started.code = code
      done()
    }),
  )
  const said = async (line: RegExp, what: string): Promise<void> => {
    for (const ends = performance.now() + 60_000; performance.now() < ends; ) {
      if (line.test(out)) return
      if ('code' in started) break
      await new Promise((done) => setTimeout(done, 20))
    }
    assert.fail(`never: ${what}. The reader said: ${out}`)
  }
  await said(/^current$/m, 'the reader is current')
  // The reader applies these writes: their ids were made by the clock of the writer, a day ahead of its own.
  for (let i = 0; i < 5; i++) await writer.call('addOrder', { title: `after the reader joined ${i}` }, system)
  const held: string[] = Object(await writer.read({ from: 'orders' }, system)).map((row: { id: string }) => row.id)
  assert.equal(held.length, 6)
  await engine.close()
  await said(/^told: /m, 'the reader took over, and added a row')
  await exited
  assert.equal(started.code, 0, out)
  const told = JSON.parse(/^told: (.*)$/m.exec(out)?.[1] ?? '{}')
  // It holds every write that it applied, and the row it made itself.
  assert.deepEqual([...told.held].sort(), [...held, told.made].sort())
  for (const id of held) assert.ok(told.made > id, `${told.made} was made after ${id}`)
})
