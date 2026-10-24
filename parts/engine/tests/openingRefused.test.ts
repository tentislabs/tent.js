import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import type { OpenOptions } from '../index.ts'
import { bundled, codeOf, engineOf, system, testClock, workFolder } from './apps.ts'

const refusedProgram = fileURLToPath(new URL('./held/refused.ts', import.meta.url))

const key = 'k'.repeat(40)

test('[21-15] an opening that fails at its last step takes back everything it started: no timer of it is left on the clock, the engine goes on with its other apps, and the folder opens once what refused it is gone', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const { clock, advance } = testClock()
  const engine = engineOf(t, { makers: { clock: () => clock } })
  const other = await engine.open(bundle.folder, { dataFolder: join(work, 'other'), mode: 'test' })
  const dataFolder = join(work, 'data')
  // A folder in the place of `engine.json`: the file is written last, when everything else was started.
  mkdirSync(join(dataFolder, 'engine.json'), { recursive: true })
  // An app with readers and backups starts the most: the machine of the link, the sweep of the rates, the upkeep.
  const options: OpenOptions = { dataFolder, mode: 'test', readers: [key], own: 'https://writer.test' }
  assert.notEqual(await codeOf(engine.open(bundle.folder, options)), undefined)
  // Two hours on, every timer of an app that is open has fallen due: none of the refused opening throws.
  for (let i = 0; i < 120; i++) advance(60_000)
  await other.write([{ add: 'tags', values: { name: 'after the refusal' } }], { as: system })
  rmSync(join(dataFolder, 'engine.json'), { recursive: true })
  const app = await engine.open(bundle.folder, options)
  await app.write([{ add: 'tags', values: { name: 'opened after all' } }], { as: system })
  for (let i = 0; i < 120; i++) advance(60_000)
  assert.equal(Object(await app.read({ from: 'tags' }, { as: system })).length, 1)
})

test('[21-15] a program whose opening of an app was refused at its last step still runs a minute and a half later, under the clock of the system', async (t) => {
  const work = workFolder(t)
  const bundle = await bundled(t, {}, work)
  const words = ['--max-old-space-size=512', refusedProgram, bundle.folder, join(work, 'data'), '95000']
  const child = spawn(process.execPath, words, { stdio: ['ignore', 'pipe', 'pipe'] })
  let said = ''
  let failed = ''
  child.stdout.setEncoding('utf8').on('data', (piece: string) => {
    said += piece
  })
  child.stderr.setEncoding('utf8').on('data', (piece: string) => {
    failed += piece
  })
  // The program is given two and a half minutes, and is ended by its number where it has not ended by then.
  const late = setTimeout(() => child.kill(), 150_000)
  t.after(() => {
    clearTimeout(late)
    child.kill()
  })
  const ended = await new Promise<number | null>((done) => child.once('exit', (code) => done(code)))
  assert.deepEqual([said.trim().split(/\r?\n/), ended], [['refused', 'still runs'], 0], failed)
})
