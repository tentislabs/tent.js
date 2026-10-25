import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { setTimeout as wait } from 'node:timers/promises'
import { runKilled } from '../rig/kill.ts'
import { planted, root } from './rigs-plant.ts'

const program = (name: string) => join(planted('3'), `${name}.ts`)
const linesOf = (file: string) => (existsSync(file) ? readFileSync(file, 'utf8').split('\n').filter(Boolean) : [])

/** Says whether the program lives whose number a planted program wrote into a file. */
function lives(file: string): boolean {
  try {
    return process.kill(Number(readFileSync(file, 'utf8')), 0)
  } catch {
    return false
  }
}

/**
 * Makes an empty folder for the work of a planted program. When the test ends, however it ends, each program whose
 * number a planted program wrote into one of `numbers`, files of that folder, is ended, and then the folder is removed.
 */
function work(t: TestContext, ...numbers: string[]): string {
  mkdirSync(join(root, 'results', 'planted'), { recursive: true })
  const folder = mkdtempSync(join(root, 'results', 'planted', '3-'))
  t.after(() => {
    // The numbers are read before anything is removed: a rig that is broken leaves these programs alive.
    for (const file of numbers.map((name) => join(folder, name)))
      if (lives(file)) process.kill(Number(readFileSync(file, 'utf8')), 'SIGKILL')
    rmSync(folder, { recursive: true, force: true })
  })
  return folder
}

/** Answers how many batches the program began in a folder, and how many of their lines are not written. */
function left(folder: string): { begun: number; lost: number } {
  const written = new Set(linesOf(join(folder, 'done.txt')))
  const batches = linesOf(join(folder, 'begun.txt'))
  const lines = batches.flatMap((batch) => Array.from({ length: 20 }, (_, k) => `${batch}:${k}`))
  return { begun: batches.length, lost: lines.filter((line) => !written.has(line)).length }
}

test('[03-3] of two programs killed ten times, the one that picks its work up ends with all of it, and the other has lost some', async (t) => {
  const [kept, gone] = [work(t), work(t)]
  // The two are killed side by side, each in a folder of its own.
  const [keeps, loses] = await Promise.all([
    runKilled(program('keeps'), { times: 10, when: 'half', args: [kept] }),
    runKilled(program('loses'), { times: 10, when: 'half', args: [gone] }),
  ])
  assert.equal(keeps.kills, 10)
  assert.equal(keeps.ended.length, 10)
  assert.ok(Number.isInteger(keeps.seed))
  for (const one of keeps.ended) assert.equal(one.code, 0, `seed ${keeps.seed}: ${one.out}`)
  assert.ok(
    keeps.ended.some((one) => /^picked up \d+$/m.test(one.out)),
    `seed ${keeps.seed}`,
  )
  assert.ok(left(kept).begun >= 10, `seed ${keeps.seed}`)
  assert.equal(left(kept).lost, 0, `seed ${keeps.seed}`)

  assert.equal(loses.kills, 10)
  for (const one of loses.ended) assert.equal(one.code, 0, `seed ${loses.seed}: ${one.out}`)
  assert.ok(left(gone).begun >= 10, `seed ${loses.seed}`)
  assert.ok(left(gone).lost > 0, `seed ${loses.seed}`)
})

test('[03-3] a moment that is drawn from the seed kills the program too, and the seed is printed and answered', async (t) => {
  const printed = t.mock.method(console, 'log', () => {})
  const folder = work(t)
  const killed = await runKilled(program('keeps'), { times: 3, within: 150, seed: 7, args: [folder] })
  assert.deepEqual([killed.kills, killed.seed, killed.ended.length], [3, 7, 3])
  assert.ok(printed.mock.calls.some((call) => String(call.arguments[0]).includes('seed 7')))
  assert.equal(left(folder).lost, 0, `seed ${killed.seed}`)
  await assert.rejects(runKilled(program('keeps'), { times: 1, args: [folder] }), /a line or a time to kill at/)
})

test('[03-3] a round in which the program ended before its kill is done again', async (t) => {
  const folder = work(t)
  const killed = await runKilled(program('third'), { times: 1, when: 'go', args: [folder] })
  assert.deepEqual(killed.ended, [{ code: 0, out: 'ended\n' }])
  // Two starts that ended by themselves, the third that was killed while it went on, and the start after the kill.
  assert.deepEqual(linesOf(join(folder, 'starts.txt')), ['start', 'start', 'start', 'start'])

  const never = work(t)
  await assert.rejects(
    runKilled(program('never'), { times: 1, when: 'go', args: [never] }),
    /never\.ts ended before its kill 10 times in a row, in round 1, seed \d+/,
  )
  assert.equal(linesOf(join(never, 'starts.txt')).length, 10)
})

test('[03-3] a start that ended before its kill is started again with its kill drawn within the time that start took', async (t) => {
  const folder = work(t)
  const killed = await runKilled(program('brief'), { times: 1, within: 60_000, seed: 2, args: [folder] })
  assert.equal(killed.kills, 1)
  assert.deepEqual(killed.ended, [{ code: 0, out: 'ended\n' }])
})

/** Waits until the program of a file is gone, for five seconds at most, and answers whether it is. */
async function gone(file: string): Promise<boolean> {
  // A system takes a moment to take a killed program off its list.
  for (let k = 0; k < 50 && lives(file); k++) await wait(100)
  return !lives(file)
}

test('[03-3] a program is ended at its line, before it can do what follows it', async (t) => {
  const folder = work(t, 'first.txt')
  const killed = await runKilled(program('after'), { times: 1, when: 'go', args: [folder] })
  assert.deepEqual(killed.ended, [{ code: 0, out: 'ended\n' }])
  // The program writes this file 150 milliseconds after its line.
  assert.equal(existsSync(join(folder, 'after.txt')), false, `the program went on after its line, seed ${killed.seed}`)
})

test('[03-3] the kill ends every program that the program started', async (t) => {
  const folder = work(t, 'started.txt')
  const killed = await runKilled(program('starts'), { times: 1, when: 'up', args: [folder] })
  assert.deepEqual(killed.ended, [{ code: 0, out: 'ended\n' }])
  assert.ok(await gone(join(folder, 'started.txt')), 'the program that the killed program started still lives')
})

test('[03-3] a round counts as killed only where the kill ended the program, with whatever number it ended by itself', async (t) => {
  const folder = work(t)
  const killed = await runKilled(program('fails'), { times: 1, when: 'go', args: [folder] })
  // Two starts that printed the line and then failed by themselves, the third that was killed, and the start after it.
  assert.deepEqual(linesOf(join(folder, 'starts.txt')), ['start', 'start', 'start', 'start'])
  assert.deepEqual(killed.ended, [{ code: 0, out: 'ended\n' }])
})

test('[03-3] a start that neither reaches its kill nor ends by itself is ended, and the promise is refused', async (t) => {
  // The start after the kill never ends.
  const again = work(t, 'second.txt')
  await assert.rejects(
    runKilled(program('hangs'), { times: 1, when: 'go', args: [again], wait: 1500 }),
    /hangs\.ts had not ended by itself after it was started again after 1500 milliseconds, in round 1, seed \d+/,
  )
  assert.ok(await gone(join(again, 'second.txt')), 'the program that hung after its kill still lives')

  // The first start never prints its line and never ends.
  const first = work(t, 'first.txt')
  await assert.rejects(
    runKilled(program('silent'), { times: 1, when: 'go', args: [first], wait: 1500 }),
    /silent\.ts had neither reached its kill nor ended by itself after 1500 milliseconds, in round 1, seed \d+/,
  )
  assert.ok(await gone(join(first, 'first.txt')), 'the program that hung before its kill still lives')
})
