import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { recordedCopy, tested } from './recordedProject.ts'
import { anotherHost, outsideCopy, testedNow } from './review12Host.ts'

/** The tests that a run printed as text, each with how it stands: `passed`, `failed` or `replayed`. */
function linesOf(printed: string): Record<string, string> {
  const lines: Record<string, string> = {}
  for (const line of printed.split('\n')) {
    const found = /^(passed|failed|replayed) (.+)$/.exec(line.trim())
    if (found) lines[found[2]] = found[1]
  }
  return lines
}

/** What `.tent/tests.json` keeps of one test, by its file and its name. */
function keptOf(project: string, file: string, name: string): { outside?: string[] } {
  const record = JSON.parse(readFileSync(join(project, '.tent', 'tests.json'), 'utf8'))
  const kept = record.tests?.[file]?.[name]?.[0]
  assert.ok(kept, `${file}: ${name} is kept`)
  return kept
}

/** Changes a file of a project by one replacement, which must take. */
function changed(project: string, path: string, from: string, to: string): void {
  const file = join(project, path)
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(from), `${path} holds ${from}`)
  writeFileSync(file, text.replace(from, to))
}

/** A first run, which must pass, then the change, then a second run: answers what the second printed of each test. */
function againAfter(project: string, change: () => void): { lines: Record<string, string>; printed: string } {
  const first = tested(project)
  assert.equal(first.ended, 0, first.printed)
  change()
  const second = tested(project)
  return { lines: linesOf(second.printed), printed: second.printed }
}

test('[53-3] a change of a file that a test file imports as it runs runs that test again', (t) => {
  const project = recordedCopy(t, 'review12-imported', 'review12/imported')
  const { lines, printed } = againAfter(project, () => changed(project, 'lib/said.ts', "said = 'one'", "said = 'two'"))
  assert.equal(lines['tests/imported.test.ts: a word the test file imports as it runs'], 'failed', printed)
})

test('[53-5] a test that reads a fixture through require is never replayed, as one that reads it through node:fs is not', (t) => {
  const project = recordedCopy(t, 'review12-required', 'review12/required')
  const { lines, printed } = againAfter(project, () => changed(project, 'tests/fixture.json', '"one"', '"two"'))
  assert.equal(lines['tests/required.test.ts: a fixture the test file reads through require'], 'failed', printed)
})

test('[53-3] a test whose function reads a word of the environment runs again where that word changed', (t) => {
  const project = recordedCopy(t, 'review12-env', 'review12/env')
  process.env.REVIEW12_WORD = 'one'
  t.after(() => {
    delete process.env.REVIEW12_WORD
  })
  const { lines, printed } = againAfter(project, () => {
    process.env.REVIEW12_WORD = 'two'
  })
  assert.equal(lines['tests/env.test.ts: a word of the environment the code of a function reads'], 'failed', printed)
})

test('[53-5] a test that makes a plain fetch of its own reached outside, and is never replayed', (t) => {
  const project = recordedCopy(t, 'review12-fetched', 'review12/fetched')
  const { lines, printed } = againAfter(project, () => undefined)
  const name = 'a test that makes a plain fetch of its own'
  assert.ok(keptOf(project, 'tests/fetched.test.ts', name).outside?.length, 'the fetch of the test is kept as outside')
  assert.equal(lines[`tests/fetched.test.ts: ${name}`], 'passed', printed)
})

test('[53-5] a test that goes on with the app an earlier test of its file opened shares its data, and is never replayed alone', (t) => {
  const project = recordedCopy(t, 'review12-shared', 'review12/shared')
  const { lines, printed } = againAfter(project, () =>
    changed(project, 'functions/add.ts', "title: input('title')", "title: 'Another'"),
  )
  assert.equal(lines['tests/shared.test.ts: the second test reads what the first one added'], 'failed', printed)
})

test('[53-3] a test inside a group that bears the name of a replayed test still runs where what it touched changed', (t) => {
  const project = recordedCopy(t, 'review12-grouped', 'review12/grouped')
  const { lines, printed } = againAfter(project, () =>
    changed(project, 'functions/open.ts', 'where({ paid: false })', 'where({ paid: false, title: "none" })'),
  )
  assert.equal(lines['tests/grouped.test.ts: open orders inside a group'], 'passed', printed)
})

test('[53-5] a test whose page loads a picture from another host, and one whose code asks another host by node:http, reached outside and are never replayed', async (t) => {
  const host = await anotherHost(t)
  const project = outsideCopy(t, 'review12-outside', host.at)
  const first = await testedNow(project)
  assert.equal(first.ended, 0, first.printed)
  // Each request truly left the program for the other host.
  assert.ok(host.asked.includes('/picture'), JSON.stringify(host.asked))
  assert.ok(host.asked.includes('/http'), JSON.stringify(host.asked))
  const second = await testedNow(project)
  const lines = linesOf(second.printed)
  assert.deepEqual(
    [
      lines['tests/pictured.test.ts: a page whose picture comes from another host'],
      lines['tests/http.test.ts: a function whose code asks another host by node:http'],
    ],
    ['passed', 'passed'],
    second.printed,
  )
})
