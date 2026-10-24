import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Type } from '../../core/index.ts'
import { boolean, choice, json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { createEngine } from '../../engine/index.ts'
import type { Typed } from './typed.ts'
import { copied, typed } from './typed.ts'

const role = choice(['writer', 'reader'])

// What `tent machines --json` and `tent take-over --json` print, as their value.
const shapes = {
  machines: object({
    epoch: text(),
    machines: list(json()),
    other: object({ epoch: text(), own: text({ optional: true }) }, { optional: true }),
  }),
  'take-over': object({
    role,
    far: boolean(),
    n: number(),
    epoch: text(),
    current: boolean(),
    lastBeat: number({ optional: true }),
    notCurrentSince: number({ optional: true }),
    others: list(json()),
    ahead: list(text()),
    fetching: number(),
    took: boolean(),
  }),
}

const wire = (value: Type) => object({ ok: boolean(), value, findings: list(json()) })

/** Holds what a command printed with `--json` to its stored shape, and answers its value. */
function shaped(name: keyof typeof shapes, output: Typed): Record<string, unknown> {
  assert.equal(output.ended, 0, `tent ${name} ends with 0: ${output.printed}`)
  assert.deepEqual(checkValue(wire(shapes[name]), output.answer), [], `the shape of tent ${name} --json`)
  return Object(output.answer.value)
}

const key = 'k'.repeat(48)

test('[15-6@4] `tent machines` and `tent take-over` print their stored shapes, on the writer and on a reader, and start no engine', async (t) => {
  // The engines are closed before the folder of the test is removed: what ends a test is done in the order it was said.
  const [one, two] = [createEngine({ port: 0 }), createEngine({ port: 0 })]
  t.after(async () => {
    await two.close()
    await one.close()
  })
  const project = copied(t, 'machines')
  const built = await buildProject(project, { for: 'dev' })
  const [writerData, readerData] = [join(project, '..', 'writer'), join(project, '..', 'reader')]
  // With no engine on the data folder, each of the two says so, and starts none.
  for (const command of ['machines', 'take-over']) {
    const none = await typed(project, command, '--data', writerData, '--json')
    assert.deepEqual([none.ended, none.answer.findings?.[0].code], [1, 'T0013'], command)
  }
  const writer = await one.open(built.bundleFolder, {
    dataFolder: writerData,
    mode: 'test',
    readers: [key],
    insecure: true,
  })
  const { port } = JSON.parse(readFileSync(join(writerData, 'engine.json'), 'utf8'))
  const from = `http://127.0.0.1:${port}`
  // The reader is started as `tent start --reads` starts one: by the address of its writer and the file of its key.
  const keyFile = join(project, '..', 'reader.key')
  writeFileSync(keyFile, `${key}\n`)
  const reader = await two.read({
    from,
    key: readFileSync(keyFile, 'utf8').trim(),
    dataFolder: readerData,
    insecure: true,
  })
  for (let i = 0; i < 400 && !reader.at().current; i++) await new Promise((done) => setTimeout(done, 10))
  assert.equal(reader.at().current, true)

  // On the writer and on the reader the command lists both machines, the writer first.
  for (const data of [writerData, readerData]) {
    const listed = shaped('machines', await typed(project, 'machines', '--data', data, '--json'))
    const machines = Object(listed.machines)
    assert.deepEqual(
      machines.map((machine: { role: string; far: boolean }) => `${machine.role} ${machine.far}`),
      ['writer false', 'reader false'],
      data,
    )
    assert.equal(listed.epoch, writer.at().epoch)
    assert.deepEqual(Object.keys(listed).sort(), ['epoch', 'machines'], data)
  }
  // As text it prints a line for each machine.
  const text = await typed(project, 'machines', '--data', writerData)
  assert.equal(text.ended, 0)
  assert.match(text.printed, /writer/)

  // `tent take-over` without `--yes` says what the machine knows, and changes nothing.
  const looked = shaped('take-over', await typed(project, 'take-over', '--data', readerData, '--json'))
  assert.deepEqual([looked.role, looked.took, looked.current, looked.far], ['reader', false, true, false])
  assert.equal(reader.role, 'reader')
  // On a reader that is current it is refused: its writer runs. And on the writer it is refused too.
  const early = await typed(project, 'take-over', '--data', readerData, '--yes', '--json')
  assert.deepEqual([early.ended, early.answer.findings?.[0].code], [1, 'T0032'])
  const onWriter = await typed(project, 'take-over', '--data', writerData, '--yes', '--json')
  assert.deepEqual([onWriter.ended, onWriter.answer.findings?.[0].code], [1, 'T0030'])
  // With the writer stopped, and the reader current no more, it takes over, and answers the epoch and its number.
  await one.close()
  for (let i = 0; i < 1500 && reader.at().current; i++) await new Promise((done) => setTimeout(done, 10))
  const took = shaped('take-over', await typed(project, 'take-over', '--data', readerData, '--yes', '--json'))
  assert.deepEqual([took.took, took.role, String(took.epoch).split('.')[0]], [true, 'reader', '2'])
  assert.equal(reader.role, 'writer')
  assert.equal(reader.at().epoch, took.epoch)
})
