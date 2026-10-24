import assert from 'node:assert/strict'
import { appendFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import type { ReplyRequest } from '../index.ts'
import { testApp } from '../../test/index.ts'
import { copyOf } from './projects.ts'
import { notDropped } from './started.ts'

// An agent that is told the moment of its run, and whose runs work one at a time.
const timed = `
export const timed = agent('timed', {
  model: writer, instructions: 'You help.', tools: [], access: 'signedIn', knows: ['time'],
  together: { max: 1, then: 'wait' },
  limits: { steps: 5, perRun: { calls: 100 } },
})
`

test('[27-17] knows time tells the time of the start of the run, though its first model step comes a day later', async (t) => {
  const folder = copyOf(t, 'limited')
  appendFileSync(join(folder, 'functions.ts'), timed)
  const app = await testApp({ folder })
  t.after(() => app.close())
  const maya = await app.user({ name: 'Maya', roles: [] })
  let go = (): void => undefined
  const held = new Promise<void>((done) => (go = done))
  t.after(go)
  const told: string[] = []
  let calls = 0
  app.fake('writer', async (request: ReplyRequest) => {
    calls++
    told.push(request.messages.map((one) => one.text ?? '').join('\n'))
    if (calls === 1) await held
    return { text: 'Done.' }
  })
  const first = notDropped(await app.start('timed', { message: 'One.' }, { as: maya }))
  for (let waited = 0; waited < 3000 && calls === 0; waited += 10) await new Promise((done) => setTimeout(done, 10))
  // The second run starts now, by the clock of the test, which stands at the time of the system until it is moved,
  // and waits its turn behind the first for a day.
  const startedAt = Date.now()
  const second = notDropped(await app.start('timed', { message: 'Two.' }, { as: maya }))
  app.clock.advance('1 day')
  go()
  await app.runs.wait(first.run)
  await app.runs.wait(second.run)
  const day = new Date(startedAt).toISOString().slice(0, 10)
  assert.match(told[1] ?? '', new RegExp(`The run started at ${day} `), told[1])
})
