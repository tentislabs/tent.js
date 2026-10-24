import assert from 'node:assert/strict'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import type { Type } from '../../core/index.ts'
import { boolean, json, list, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import { tent } from '../shell.ts'
import { builtShop, workOf } from './secured.ts'

// The owner's clean machines, where a definition is installed into the system.
const clean = process.env.TENT_CLEAN_MACHINE === 'yes'
const onClean = { todo: clean ? false : "the owner's clean machines of the three systems: it installs into the system" }

// What `tent service` answers with `--json`: the definition it prints, or where it wrote one.
const wire = (value: Type): Type => object({ ok: boolean(), value, findings: list(json()) })
const printed = wire(text())
const installed = wire(object({ installed: text() }))

/** Runs `tent service` in this program with `--json`, and answers the number it ended with and what it printed. */
async function served(words: string[], folder: string): Promise<{ code: number; answer: unknown; out: string }> {
  const lines: string[] = []
  const code = await tent(['service', ...words, '--json'], { folder, out: (line) => lines.push(line) })
  const out = lines.join('\n')
  let answer: unknown
  try {
    answer = JSON.parse(out)
  } catch {
    answer = undefined
  }
  return { code, answer, out }
}

test('[41-11] [15-6@10b] the --json shape of tent service for a bundle, as it prints a definition and its one line', async (t) => {
  const folder = workOf(t, 'service-shape')
  const { project, bundle } = await builtShop(folder)
  const data = join(folder, 'data')
  for (const words of [
    [bundle, '--data', data],
    [bundle, '--data', data, '--line'],
  ]) {
    const done = await served(words, project)
    assert.equal(done.code, 0, done.out)
    assert.deepEqual(checkValue(printed, done.answer), [], done.out)
    assert.match(String(Reflect.get(Object(done.answer), 'value')), /start/)
  }
})

test(
  '[41-11] the --json shape of tent service --install for a bundle, as it writes a definition',
  onClean,
  async (t) => {
    // A test that is owed runs all the same: it stops here, before it writes into the system.
    assert.ok(clean, 'this is a clean machine of the owner, which TENT_CLEAN_MACHINE=yes names')
    const folder = workOf(t, 'service-installed')
    const { project, bundle } = await builtShop(folder)
    const data = join(folder, 'data')
    mkdirSync(data)
    const done = await served([bundle, '--data', data, '--install', '--yes'], project)
    assert.equal(done.code, 0, done.out)
    assert.deepEqual(checkValue(installed, done.answer), [], done.out)
  },
)
