import assert from 'node:assert/strict'
import { test } from 'node:test'
import { command, copyOf, planted, programs, root, start } from './rigs-plant.ts'

const comments = (folder: string) => start(root, programs.comments, folder)

/** Holds that the rig fails on a tree, and names each of `lines` as `<file>:<line>`. */
function failsOn(folder: string, lines: string[]): string {
  const ended = comments(folder)
  assert.equal(ended.code, 1, ended.out)
  for (const line of lines) assert.ok(ended.out.includes(`${line}  `), `${line} is not named in:\n${ended.out}`)
  return ended.out
}

function passesOn(folder: string): void {
  const ended = comments(folder)
  assert.equal(ended.code, 0, ended.out)
}

test('[03-11] a comment with a date fails, and the date passes in an address and in the text between two tags', (t) => {
  const out = failsOn(planted('11'), [
    'rig/dated.ts:1',
    'rig/dated.ts:3',
    'rig/dated.ts:5',
    'rig/dated.ts:7',
    'rig/dated.ts:9',
    'rig/screenDated.tsx:1',
  ])
  assert.doesNotMatch(out, /rig\/address\.ts|rig\/screen\.tsx/)
  // The line holds a date in its text and another in its comment, and the comment alone is read.
  assert.ok(out.includes('rig/screenDated.tsx:1  a date in a comment: 2026-10-13'), out)
  assert.doesNotMatch(out, /rig\/screenDated\.tsx.*2026-10-12/)
  assert.match(out, /^6 found/m)
  passesOn(copyOf(t, '11', ['rig/dated.ts', 'rig/screenDated.tsx']))
})

test('[03-12] a comment with the label of a build step that has a letter fails', (t) => {
  const out = failsOn(planted('12'), ['rig/labelled.ts:1'])
  assert.doesNotMatch(out, /rig\/plain\.ts/)
  passesOn(copyOf(t, '12', ['rig/labelled.ts']))

  // The formatter and the linter pass this tree, so it is the script, as the command carries it out, that fails.
  const byCommand = command(copyOf(t, '12'), 'lint')
  assert.equal(byCommand.code, 1, byCommand.out)
  assert.ok(byCommand.out.includes('rig/labelled.ts:1  the label of a build step'), byCommand.out)
  assert.doesNotMatch(byCommand.out, /Found \d+ (error|warning)/)
  const byCommandWithout = command(copyOf(t, '12', ['rig/labelled.ts']), 'lint')
  assert.equal(byCommandWithout.code, 0, byCommandWithout.out)
})

test('[03-13] a comment with a "to do" fails', (t) => {
  const out = failsOn(planted('13'), [
    'rig/later.ts:1',
    'rig/later.ts:3',
    'rig/later.ts:5',
    'rig/later.ts:7',
    'rig/later.ts:9',
  ])
  assert.doesNotMatch(out, /rig\/done\.ts/)
  passesOn(copyOf(t, '13', ['rig/later.ts']))
})

test('[03-15] a line that switches a rule off fails outside a wrapper, and passes in one', (t) => {
  const out = failsOn(planted('15'), [
    'parts/one/off.ts:1',
    'parts/one/off.ts:3',
    'parts/one/off.ts:5',
    'parts/one/off.ts:7',
  ])
  assert.doesNotMatch(out, /parts\/one\/borrowed\/wrapper\.ts/)
  passesOn(copyOf(t, '15', ['parts/one/off.ts']))
})

test('[03-16] a cast through `unknown` fails outside a wrapper, and passes in one', (t) => {
  const out = failsOn(planted('16'), ['rig/cast.ts:1', 'rig/screen.tsx:1'])
  assert.doesNotMatch(out, /rig\/said\.ts|rig\/screenSaid\.tsx/)
  assert.doesNotMatch(out, /parts\/one\/borrowed\/wrapper\.ts/)
  passesOn(copyOf(t, '16', ['rig/cast.ts', 'rig/screen.tsx']))
})

test('[03-25] a comment with the label of a trial, a decision or a review, or the file name of a build document, fails', (t) => {
  const cases = ['rig/trial.ts', 'rig/decision.ts', 'rig/review.ts', 'rig/document.ts', 'docs/reviewed.mjs']
  const all = failsOn(planted('25'), [
    'rig/trial.ts:1',
    'rig/trial.ts:3',
    'rig/trial.ts:5',
    'rig/decision.ts:1',
    'rig/decision.ts:3',
    'rig/document.ts:1',
    'docs/reviewed.mjs:1',
  ])
  // A script under `docs/` may name a step, a trial, a decision and a build document, and nothing else of these.
  assert.doesNotMatch(all, /docs\/reads\.mjs/)
  for (const line of [1, 3]) assert.ok(all.includes(`rig/review.ts:${line}  the label of a review`), all)
  for (const one of cases) {
    const out = failsOn(
      copyOf(
        t,
        '25',
        cases.filter((other) => other !== one),
      ),
      [`${one}:1`],
    )
    assert.doesNotMatch(out, /rig\/product\.ts|docs\/reads\.mjs/)
  }
  passesOn(copyOf(t, '25', cases))
})
