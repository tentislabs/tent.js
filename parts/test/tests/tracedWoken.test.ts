import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine } from '../../engine/index.ts'
import { closing, copyOf } from './projects.ts'
import { untilWithin } from './remotes.ts'

/** The name and the trace of each row of a table of the log of the app, the spans where none is named, oldest first. */
function spansIn(dataFolder: string, table = 'spans'): { name: string; trace: string }[] {
  const db = new DatabaseSync(join(dataFolder, 'logs.db'), { readOnly: true })
  try {
    return db
      .prepare(`SELECT name, trace FROM "${table}" ORDER BY rowid`)
      .all()
      .map((row) => ({ name: String(row.name), trace: String(row.trace) }))
  } finally {
    db.close()
  }
}

test('[44-1] a run woken after a restart carries the trace it began in on', async (t) => {
  const folder = copyOf(t, 'tracedWoken')
  const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
  const dataFolder = join(folder, 'data')
  const first = createEngine({ port: 0 })
  const app = await first.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await app.call('placeOrder', { title: 'Lamp' }, { as: { kind: 'system' } })
  const run = (): string | undefined => app.runs.find({ flow: 'ship', states: ['waiting'] })[0]?.id
  await untilWithin('the run waits', () => run() !== undefined, 20_000)
  const id = String(run())
  // The program ends while the run waits, and is started again: the run wakes in the new one.
  await first.close()
  const second = createEngine({ port: 0 })
  closing(t, () => second.close())
  const again = await second.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await untilWithin('the woken run is done', () => again.runs.read(id)?.state === 'done', 30_000)
  await untilWithin(
    'the step after the wake is kept',
    () => spansIn(dataFolder).some((one) => one.name === 'send'),
    10_000,
  )
  const spans = spansIn(dataFolder)
  const trace = (name: string): string | undefined => spans.find((one) => one.name === name)?.trace
  // The steps before and after the restart stand in one trace: the one the call began.
  assert.equal(trace('send'), trace('pack'), JSON.stringify(spans))
})

test('[44-1] at a share of 0 a run woken after a restart carries the trace it began in on: its failure is kept in the trace of the call', async (t) => {
  const folder = copyOf(t, 'tracedWoken')
  const project = join(folder, 'tent.ts')
  writeFileSync(project, readFileSync(project, 'utf8').replace('share: 1', 'share: 0'))
  // The step after the wake fails once and for all: the trace that holds it is kept.
  const file = join(folder, 'functions.ts')
  // The order as the code of the flow writes it inside its texts.
  const order = ['$', '{input.order}'].join('')
  const sent = `return step('send', () => \`sent ${order}\`)`
  writeFileSync(
    file,
    readFileSync(file, 'utf8')
      .replace("export const ship = flow('ship', {", "export const ship = flow('ship', {\n  tries: 1,")
      .replace(sent, `return step('send', () => {\n      throw new RangeError(\`no van for ${order}\`)\n    })`),
  )
  const made = await buildProject(folder, { for: 'dev', out: join(folder, 'bundle') })
  const dataFolder = join(folder, 'data')
  const first = createEngine({ port: 0 })
  const app = await first.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await app.call('placeOrder', { title: 'Lamp' }, { as: { kind: 'system' } })
  const run = (): string | undefined => app.runs.find({ flow: 'ship', states: ['waiting'] })[0]?.id
  await untilWithin('the run waits', () => run() !== undefined, 20_000)
  const id = String(run())
  await first.close()
  const second = createEngine({ port: 0 })
  closing(t, () => second.close())
  const again = await second.open(made.bundleFolder, { dataFolder, mode: 'test' })
  await untilWithin('the woken run failed', () => again.runs.read(id)?.state === 'failed', 30_000)
  await untilWithin('its failure is kept', () => spansIn(dataFolder).some((one) => one.name === 'send'), 10_000)
  const call = spansIn(dataFolder, 'calls').find((one) => one.name === 'placeOrder')
  const failed = spansIn(dataFolder).find((one) => one.name === 'send')
  assert.equal(failed?.trace, call?.trace, JSON.stringify(spansIn(dataFolder)))
})
