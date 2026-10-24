import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { handing, stepsOf } from './sequencing.ts'
import { notDropped } from './started.ts'

// An agent of sequences that saves the reasoning of its model.
const noted = `
export const noted = agent('noted', {
  model: writer, instructions: 'You judge.', tools: [myOrders], sequence: true, access: 'signedIn',
  reasoning: { save: true }, limits,
})
`

test('[27-18] a fill of an agent that saves its reasoning saves the value alone, and its reasoning nowhere', async (t) => {
  const folder = copyOf(t, 'sequenced')
  appendFileSync(join(folder, 'functions.ts'), noted)
  const app = await testApp({ folder })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  const judge = handing("return fill(boolean(), 'Is it late?')")
  app.fake('writer', (request: ReplyRequest) =>
    request.shape === undefined ? judge(request) : { value: true, reasoning: 'Thinking it over.' },
  )
  const { run } = notDropped(await app.start('noted', { message: 'Judge.' }, { as: maya }))
  await app.runs.wait(run)
  const fill = stepsOf(app, run).find((one) => one.name === 'fill 1.1.1')
  assert.equal(fill?.state, 'done')
  assert.equal(fill?.result, true)
  assert.doesNotMatch(JSON.stringify(stepsOf(app, run)), /Thinking it over/)
})
