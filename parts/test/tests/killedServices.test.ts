import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { runKilled } from '../../../rig/kill.ts'
import { buildProject } from '../../build/index.ts'
import { copyOf } from './projects.ts'
import { answerJson, remoteOf } from './remotes.ts'

/** What the last start of the killed program printed when every run had ended. */
function endedOf(out: string): { runs: { state: string; input: { i: number }; steps: string[] }[]; marks: string[] } {
  const found = /^ended: (.*)$/m.exec(out)
  assert.ok(found, `the program printed no end: ${out}`)
  return JSON.parse(found[1])
}

test('[23-2] [night] killed at random a thousand times across many runs: no step is lost, and a step that ran twice is only ever one whose once-only key was sent both times', async (t) => {
  const remote = await remoteOf(t, (_, response) => answerJson(response, 200, {}))
  const folder = copyOf(t, 'killing')
  const file = join(folder, 'app', 'functions.ts')
  writeFileSync(file, readFileSync(file, 'utf8').split('http://127.0.0.1:1').join(remote.origin))
  const made = await buildProject(join(folder, 'app'), { for: 'dev', out: join(folder, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  // Each start that finds every run ended starts a batch of three, so that each round has work to be killed in.
  const killed = await runKilled(join(import.meta.dirname, 'killing', 'run.ts'), {
    times: 1000,
    within: 1000,
    seed: 2302,
    args: [made.bundleFolder, join(folder, 'data'), '3'],
    wait: 120_000,
  })
  assert.equal(killed.kills, 1000)
  const last = killed.ended.at(-1)
  assert.ok(last)
  assert.equal(last.code, 0, last.out)
  const ended = endedOf(last.out)
  const numbers = ended.runs.map((run) => run.input.i)
  assert.ok(numbers.length >= 3, `${numbers.length} runs`)
  assert.equal(new Set(numbers).size, numbers.length, 'no run was started twice')
  const tags = numbers.flatMap((i) => [1, 2, 3, 4, 5].map((k) => `${i}/${k}`))
  for (const run of ended.runs) {
    assert.equal(run.state, 'done', `the run of ${run.input.i}`)
    assert.deepEqual(
      run.steps,
      [1, 2, 3, 4, 5].map((k) => `book ${k}:done`),
    )
  }
  // Each step marked its tag once: its change was carried out once for its key, however often the step ran.
  assert.deepEqual([...ended.marks].sort(), [...tags].sort())
  // The service heard every tag, and a tag that it heard twice came with the same key each time.
  const keys = new Map<string, Set<string>>()
  for (const one of remote.heard) {
    const tag = String(JSON.parse(one.body.toString('utf8')).tag)
    const held = keys.get(tag) ?? new Set()
    held.add(one.headers['idempotency-key'])
    keys.set(tag, held)
  }
  assert.deepEqual([...keys.keys()].sort(), [...tags].sort())
  for (const [tag, held] of keys) assert.equal(held.size, 1, `the tag ${tag} was sent with ${held.size} keys`)
})
