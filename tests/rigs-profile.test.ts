import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copyOf, programs, root, start } from './rigs-plant.ts'

/** What `results/profile.json` holds of one test file. */
type Profiled = { ms: number; peak: number; sum: number; programs: number }

test('[54-1] node scripts/tests.mjs --profile writes results/profile.json, each test file with its time, the peak of its program and the sum of its programs, also of a program a test started, and prints the costliest files and the peak of the run', (t) => {
  const folder = copyOf(t, '54-1')
  const ran = start(root, programs.tests, folder, '--profile')
  assert.equal(ran.code, 0, ran.out)
  const profile = JSON.parse(readFileSync(join(folder, 'results', 'profile.json'), 'utf8'))
  const files: Record<string, Profiled> = profile.files
  const started = files['tests/started.test.ts']
  const plain = files['tests/plain.test.ts']
  assert.ok(started && plain, JSON.stringify(profile))
  for (const one of [started, plain]) assert.ok(one.ms > 0 && one.peak > 0 && one.sum >= one.peak, JSON.stringify(one))
  // The program a test started is counted with its file: its forty megabytes stand in the sum and not in the peak.
  assert.equal(started.programs, 2, JSON.stringify(started))
  assert.equal(plain.programs, 1, JSON.stringify(plain))
  assert.ok(started.sum - started.peak >= 40 * 1024 * 1024, JSON.stringify(started))
  assert.ok(profile.peak > 0 && profile.ms > 0, JSON.stringify(profile))
  assert.match(ran.out, /costliest by time:\n.*tests\/(started|plain)\.test\.ts/)
  assert.match(ran.out, /costliest by memory:\n.*tests\/(started|plain)\.test\.ts/)
  assert.match(ran.out, /peak of the run: \d+ MB/)
})

test('[54-2] a run hands its programs and the programs they start NODE_COMPILE_CACHE under results/compile-cache/, a second run finds it filled, and no path under results/ stands in any record of results/kept/', (t) => {
  const folder = copyOf(t, '54-1')
  const cache = join(folder, 'results', 'compile-cache')
  // The planted test holds that it and the program it starts are handed the cache.
  const first = start(root, programs.tests, folder, '--all')
  assert.equal(first.code, 0, first.out)
  assert.ok(existsSync(cache), 'the run made the cache')
  const filled = readdirSync(cache, { recursive: true }).length
  assert.ok(filled > 0, 'the cache holds what the programs compiled')
  const second = start(root, programs.tests, folder, '--all')
  assert.equal(second.code, 0, second.out)
  assert.ok(readdirSync(cache, { recursive: true }).length >= filled, 'the second run found the cache as it was')
  for (const name of readdirSync(join(folder, 'results', 'kept'))) {
    const kept = JSON.parse(readFileSync(join(folder, 'results', 'kept', name), 'utf8'))
    for (const [file, record] of Object.entries(kept))
      for (const path of Object(record).touched ?? [])
        assert.ok(!String(path).startsWith('results/'), `${file} stands on ${path}`)
  }
})
