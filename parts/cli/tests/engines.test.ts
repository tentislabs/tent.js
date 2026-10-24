import assert from 'node:assert/strict'
import { test } from 'node:test'
import { copied, typedApart } from './typed.ts'

test('[48-1] tent test runs a test in Firefox and WebKit where they speak WebDriver BiDi, and names one as not run where its engine does not, never as passed', async (t) => {
  const project = copied(t, 'engines', 'engines')
  const tested = typedApart(project, 'test', '--json')
  const value: Record<string, unknown> = Object(tested.answer.value)
  const notRun = Array.isArray(value.notRun) ? value.notRun.map((one) => String(Reflect.get(Object(one), 'test'))) : []
  assert.equal(tested.ended, 0, tested.printed)
  assert.equal(value.failed, 0, tested.printed)
  // Chromium and Firefox speak a channel the engine drives on every system: their tests run and pass.
  for (const engine of ['chromium', 'firefox'])
    assert.ok(!notRun.some((one) => one.endsWith(`in ${engine}`)), `${engine} runs: ${tested.printed}`)
  // WebKit runs where it speaks WebDriver BiDi, and is named as not run where it does not: never counted as passed.
  const webkit = notRun.filter((one) => one.endsWith('in webkit'))
  assert.equal(value.passed, 3 - webkit.length, tested.printed)
  assert.equal(Number(value.passed) + webkit.length, 3)
  for (const one of Array.isArray(value.notRun) ? value.notRun : [])
    assert.match(String(Reflect.get(Object(one), 'why')), /WebDriver BiDi/)
})
