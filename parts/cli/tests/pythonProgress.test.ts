import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { test } from 'node:test'
import { opened, sharedPython, untilWithin } from './pythonApps.ts'
import { notDropped } from './started.ts'

const shared = sharedPython('progress')

/**
 * Starts the program of the tests that holds the app. Answers its number, the first line of JSON it says with a
 * `want` in it, refused with all it said where it ends or takes a minute first, and the number it ends with.
 */
function holding(
  dataFolder: string,
  what: string,
  want: string,
): { pid: number; said: Promise<Record<string, unknown>>; ended: Promise<number | null> } {
  const child = spawn(
    process.execPath,
    [join(import.meta.dirname, 'pythonPrograms', 'engine.ts'), shared.bundle, dataFolder, what],
    { stdio: ['ignore', 'pipe', 'pipe'] },
  )
  const told: string[] = []
  child.stderr.on('data', (piece: Buffer) => told.push(piece.toString()))
  const ended = new Promise<number | null>((done) => child.on('exit', done))
  const said = new Promise<Record<string, unknown>>((done, failed) => {
    const timer = setTimeout(() => failed(new Error(`no ${want} within a minute: ${told.join('')}`)), 60_000)
    createInterface({ input: child.stdout }).on('line', (line) => {
      told.push(line)
      const read = JSON.parse(line)
      if (want in read) {
        clearTimeout(timer)
        done(read)
      }
    })
    void ended.then(() => {
      clearTimeout(timer)
      failed(new Error(`it ended with no ${want}: ${told.join('\n')}`))
    })
  })
  return { pid: child.pid ?? 0, said, ended }
}

/** Ends a program of the test by its number, where it still runs. */
function ended(pid: number): void {
  try {
    process.kill(pid)
  } catch {
    // It ended by itself, or was killed by the test already.
  }
}

test('[25-16] a step that saved its progress and was killed is handed it when it is made again, and outside a step tent.progress() gives nothing', async (t) => {
  const { app, user } = await opened(t, shared)
  assert.deepEqual(await app.call('progressing', { wait: false }, { as: await user() }), { handed: null })

  const dataFolder = mkdtempSync(join(shared.home, '..', 'progress-'))
  const first = holding(dataFolder, 'progress', 'saved')
  t.after(() => ended(first.pid))
  await first.said
  // The engine is killed in the middle of the step, after the Python program kept the progress.
  ended(first.pid)
  await first.ended
  const again = holding(dataFolder, 'resume', 'answer')
  t.after(() => ended(again.pid))
  const { answer } = await again.said
  assert.deepEqual(answer, { handed: { n: 5 } })
  assert.equal(await again.ended, 0)
})

test('[25-16] a progress is held to limits.result that its flow states: past it the step fails with T5102', async (t) => {
  const { app, user } = await opened(t, shared)
  const { run } = notDropped(await app.start('smallScoring', {}, { as: await user() }))
  await untilWithin(() => app.runs.read(run)?.steps[0]?.error !== undefined, 'the step failed', 60_000)
  const error = app.runs.read(run)?.steps[0]?.error
  assert.equal(error?.code, 'T5102')
  assert.match(String(error?.message), /1024/)
})
