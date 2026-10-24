import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findPage } from '../index.ts'

// What sample app 5 found missing of a run of an agent that a page shows, and of a message to a conversation
// that a run holds.

/** The section of a page under its `## ` heading, with no heading of its own after it. */
function sectionOf(name: string, heading: string): string {
  const page = findPage(name)
  assert.ok(page, `the page ${name} is there`)
  const start = page.text.indexOf(`\n## ${heading}\n`)
  assert.ok(start >= 0, `${name} has the section ${heading}`)
  const end = page.text.indexOf('\n## ', start + 1)
  return page.text.slice(start, end < 0 ? undefined : end)
}

test('[03-5] the page of useAgent names the type it answers, and gives each member of steps, said and asks as the code holds them', () => {
  const returns = sectionOf('hook.useAgent', 'Returns')
  assert.match(returns, /`AgentShown`/)
  for (const shape of [
    '`{ name, repeat, tool?, state, ms?, runs? }`',
    '`{ step, repeat, value }`',
    '`{ run, step, repeat, n, tool, input, call?, sequence?, more? }`',
  ])
    assert.ok(returns.includes(shape), `the page gives ${shape}`)
  assert.match(returns, /`'started'`, `'waiting'`, `'done'` or `'failed'`/)
  assert.match(returns, /`\{ step, tool, input, asks, agreed\? \}`/)
})

test('[03-5] the page of T7103 tells a message to a conversation that a run works or waits on, and the way: wait for its end or its ask, or hold the message', () => {
  const page = findPage('code.T7103')
  assert.ok(page, 'the page code.T7103 is there')
  assert.match(sectionOf('code.T7103', 'Details'), /conversation[^.]*(?:works|working)[^.]*wait/)
  const fix = sectionOf('code.T7103', 'The fix')
  assert.match(fix, /ask/)
  assert.match(fix, /holds? the message/)
})
