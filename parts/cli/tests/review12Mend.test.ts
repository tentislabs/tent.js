import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { recordedCopy, tested } from './recordedProject.ts'
import { anotherHost, testedNow } from './review12Host.ts'

/** The tests that a run printed as text, each with how it stands: `passed`, `failed` or `replayed`. */
function linesOf(printed: string): Record<string, string> {
  const lines: Record<string, string> = {}
  for (const line of printed.split('\n')) {
    const found = /^(passed|failed|replayed) (.+)$/.exec(line.trim())
    if (found) lines[found[2]] = found[1]
  }
  return lines
}

/** A run with a word of the environment set to a value, and the word taken away again after it. */
function testedWith(project: string, word: string, ...words: string[]): ReturnType<typeof tested> {
  process.env.REVIEW12_WORD = word
  try {
    return tested(project, ...words)
  } finally {
    delete process.env.REVIEW12_WORD
  }
}

/** Two runs, the first with the word `one`, which must pass, and the second with `two`: what the second printed. */
function wordChanged(project: string, ...words: string[]): { lines: Record<string, string>; printed: string } {
  const first = testedWith(project, 'one', ...words)
  assert.equal(first.ended, 0, first.printed)
  const second = testedWith(project, 'two', ...words)
  return { lines: linesOf(second.printed), printed: second.printed }
}

test('[53-3] a test whose function reads a word of the environment from a copy of the whole environment runs again where that word changed', (t) => {
  const project = recordedCopy(t, 'review12-env-copied', 'review12/envCopied')
  const { lines, printed } = wordChanged(project)
  const name = 'tests/envCopied.test.ts: a word of the environment the code of a function reads from a copy of it'
  assert.equal(lines[name], 'failed', printed)
})

test('[53-3] a test whose function reads a word of the environment through a package runs again where that word changed', (t) => {
  const project = recordedCopy(t, 'review12-env-packaged', 'review12/envPackaged')
  const folder = join(project, 'node_modules', 'review12-word')
  mkdirSync(folder, { recursive: true })
  writeFileSync(
    join(folder, 'package.json'),
    JSON.stringify({ name: 'review12-word', version: '1.0.0', type: 'module', exports: './index.js' }),
  )
  writeFileSync(join(folder, 'index.js'), "export const word = () => process.env.REVIEW12_WORD ?? 'none'\n")
  const { lines, printed } = wordChanged(project)
  const name = 'tests/envPackaged.test.ts: a word of the environment a package reads for the code of a function'
  assert.equal(lines[name], 'failed', printed)
})

test('[53-3] a test whose action reads a word of the environment in the test room runs again where that word changed', (t) => {
  const project = recordedCopy(t, 'review12-env-apart', 'review12/envAction')
  const { lines, printed } = wordChanged(project, '--room', 'apart')
  assert.equal(
    lines['tests/envAction.test.ts: a word of the environment the code of an action reads'],
    'failed',
    printed,
  )
})

test('[53-17] a page that clears what it keeps for the tab and loads again draws ids of its calls that no document before drew', (t) => {
  const project = recordedCopy(t, 'review12-storage', 'review12/storage')
  const ran = tested(project, 'tests/storage.test.ts')
  assert.equal(ran.ended, 0, ran.printed)
})

test('[53-5] a test that reads a file of the project through a program it starts reached outside, and is never replayed', (t) => {
  const project = recordedCopy(t, 'review12-started', 'review12/started')
  const first = tested(project)
  assert.equal(first.ended, 0, first.printed)
  writeFileSync(join(project, 'data.txt'), 'two\n')
  const second = tested(project)
  const name = 'tests/started.test.ts: a test that reads a file of the project through a program it starts'
  assert.equal(linesOf(second.printed)[name], 'failed', second.printed)
})

test('[53-3] a test that held a page to what a reader of the screen hears runs again where the kept text changed', (t) => {
  const project = recordedCopy(t, 'review12-heard', 'review12/heard')
  const kept = join(project, 'tests', 'heard', 'chromium', 'home.txt')
  // The first run keeps nothing yet: what it heard is written beside, and kept as a person keeps it.
  const unkept = tested(project)
  assert.equal(unkept.ended, 1, unkept.printed)
  renameSync(kept.replace(/\.txt$/, '.new.txt'), kept)
  const first = tested(project)
  assert.equal(first.ended, 0, first.printed)
  writeFileSync(kept, `${readFileSync(kept, 'utf8')}\nA line that the page does not say`)
  const second = tested(project)
  const name = 'tests/heard.test.ts: the home screen sounds as it was kept'
  assert.equal(linesOf(second.printed)[name], 'failed', second.printed)
})

test('[53-3] a test that held a page to a kept picture runs again where the picture was kept anew while the run went on', (t) => {
  const project = recordedCopy(t, 'review12-looked', 'review12/looked')
  const kept = join(project, 'tests', 'looks', 'chromium', 'home.png')
  const unkept = tested(project)
  assert.equal(unkept.ended, 1, unkept.printed)
  renameSync(kept.replace(/\.png$/, '.new.png'), kept)
  // The test passes, and the picture is kept anew after it was held to it, while the run goes on.
  const first = tested(project)
  assert.equal(first.ended, 0, first.printed)
  const second = tested(project)
  const name = 'tests/looked.test.ts: the home screen looks as it was kept'
  assert.equal(linesOf(second.printed)[name], 'failed', second.printed)
})

test('[53-5] a test whose function connects to another host by WebSocket reached outside, and is never replayed', async (t) => {
  const host = await anotherHost(t)
  const project = recordedCopy(t, 'review12-socket', 'review12/socket')
  writeFileSync(join(project, 'lib', 'at.ts'), `export const socketAt = '${host.at.replace('http', 'ws')}/socket'\n`)
  const first = await testedNow(project)
  assert.equal(first.ended, 0, first.printed)
  assert.ok(host.asked.includes('/socket'), JSON.stringify(host.asked))
  const second = await testedNow(project)
  const name = 'tests/socket.test.ts: a function whose code connects to another host by WebSocket'
  assert.equal(linesOf(second.printed)[name], 'passed', second.printed)
})

test('[53-14] no generated case reaches outside: code that connects to another host by WebSocket is held', async (t) => {
  const host = await anotherHost(t)
  const project = recordedCopy(t, 'review12-socket-declared', 'review12/socket')
  rmSync(join(project, 'tests'), { recursive: true, force: true })
  writeFileSync(join(project, 'lib', 'at.ts'), `export const socketAt = '${host.at.replace('http', 'ws')}/socket'\n`)
  const ran = await testedNow(project, '--declared')
  assert.match(ran.printed, /socketOut - access/, ran.printed)
  assert.deepEqual(host.asked, [])
})
