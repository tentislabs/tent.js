import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { copied, typedApart } from './typed.ts'

/** What an evaluation keeps of one case. */
interface KeptCase {
  name: string
  pass: boolean
  score: number
  runs: { pass: boolean }[]
}

/** The evaluation that a run of `tent test --ai` kept, read from the file its answer names. */
function evaluated(project: string, ...words: string[]) {
  const ran = typedApart(project, 'test', '--ai', '--json', ...words)
  const file = String(Reflect.get(Object(ran.answer.value), 'evaluation'))
  const kept = JSON.parse(readFileSync(file, 'utf8'))
  const [result] = kept.results
  const each: KeptCase[] = Array.isArray(result?.each) ? result.each : []
  return { ran, result, each }
}

test('[17-4] evals: every run starts from the same data, a tool that asks is refused and noted, a judge scores, with every model faked no provider is called, and with none nothing is stopped', (t) => {
  const project = copied(t, 'evaluated-whole', 'evaluated')
  const { ran, result, each } = evaluated(project, '--budget', 'none')
  assert.equal(ran.ended, 0, ran.printed)
  assert.equal(result.notRun, 0)
  const byName = Object.fromEntries(each.map((one) => [one.name, one]))
  // Each of the three runs of a case that adds an order finds one order: the data of the mark, each time.
  assert.equal(byName.adds.pass, true, JSON.stringify(byName.adds))
  assert.equal(byName.adds.runs.length, 3)
  assert.equal(byName.refunds.pass, true, JSON.stringify(byName.refunds))
  assert.equal(byName.judged.pass, true)
  assert.equal(byName.judged.score, 0.9)
  // What the faked models reported was counted: no provider was called, and no key was needed.
  assert.ok(result.used.images > 0, JSON.stringify(result.used))
})

test('[17-4] --budget stops the rest and counts them in notRun; given twice it bounds two units, and the first that is passed stops the rest; a fake that answers images reaches a budget of images', (t) => {
  const project = copied(t, 'evaluated-budget', 'evaluated')
  const tokens = evaluated(project, '--budget', 'tokensOut=25')
  assert.equal(tokens.ran.ended, 0, tokens.ran.printed)
  assert.equal(tokens.result.notRun, 2)
  assert.equal(tokens.each.length, 1)
  assert.equal(tokens.each[0].runs.length, 1)
  const two = evaluated(project, '--budget', 'tokensOut=1000', '--budget', 'images=5')
  assert.equal(two.ran.ended, 0, two.ran.printed)
  assert.equal(two.result.notRun, 2)
  assert.ok(two.result.used.images >= 5)
  assert.ok(two.result.used.tokensOut < 1000)
})

test('[17-4] a planted worse prompt is shown as worse by --compare', (t) => {
  const project = copied(t, 'evaluated-compare', 'evaluated')
  const first = evaluated(project, '--budget', 'none')
  assert.equal(first.ran.ended, 0, first.ran.printed)
  const functions = join(project, 'functions.ts')
  writeFileSync(functions, readFileSync(functions, 'utf8').replace("'Answer in full.'", "'Answer briefly.'"))
  const second = typedApart(project, 'test', '--ai', '--json', '--budget', 'none', '--compare')
  assert.equal(second.ended, 1, second.printed)
  const messages = (second.answer.findings ?? []).map((one) => one.message).join('\n')
  assert.match(messages, /the case "judged" passed before and fails now/)
})
