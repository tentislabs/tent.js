import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import test from 'node:test'
import type { App, Provider, ReplyRequest } from '../index.ts'
import { bundled, engineOf, testClock, workFolder } from './apps.ts'
import { notDropped } from './started.ts'
import { person, untilAsync } from './workUse.ts'

// The bytes 0 to 255, as a page that answers bytes and no text gives them.
const bytes = Buffer.from(Array.from({ length: 256 }, (_, at) => at)).toString('base64')

// A project of this test alone: a flow tool whose one step fetches twice, under a tool call that nobody agreed to.
const tables = `import { list, project, table, text } from 'tentjs'
export const reviewFlows = project('reviewFlows', { zone: 'UTC' })
export const users = table('users', { columns: { name: text(), roles: list(text()) }, access: { read: 'signedIn' } })
`
const functions = `import { agent, flow, model, number } from 'tentjs'
export const thinker = model('thinker', { provider: 'mine', name: 'm-1', abilities: ['reply', 'tools'], takes: 100000 })
export const twoFetches = flow('twoFetches', {
  about: 'Fetches twice',
  access: 'signedIn',
  as: 'starter',
  input: {},
  output: number(),
  sends: false,
  run: async ({ step }) =>
    step('fetch', async () => {
      const first = new Uint8Array(await (await fetch('data:application/octet-stream;base64,${bytes}')).arrayBuffer())
      await fetch('data:text/plain,second')
      return first.length
    }),
})
export const helper = agent('helper', {
  model: thinker,
  instructions: 'You fetch.',
  tools: [twoFetches],
  access: 'signedIn',
  limits: { steps: 4, perRun: { calls: 20 } },
})
`

/** A model that asks for the flow tool when a person spoke last, and else says what it answered. */
const mine: Provider = {
  async *reply(o: ReplyRequest) {
    const last = o.messages.at(-1)
    if (last?.who === 'user') yield { end: { text: '', calls: [{ id: 'c1', tool: 'twoFetches', input: {} }] } }
    else yield { end: { text: JSON.stringify(last?.error ?? last?.result ?? null), calls: [] } }
  },
}

test('[23-28] an agreed fetch that is given its kept answer in a later making is handed the bytes of its body as they came, a body that is no text among them', async (t) => {
  const { clock } = testClock()
  const project = workFolder(t)
  writeFileSync(join(project, 'tables.ts'), tables)
  writeFileSync(join(project, 'functions.ts'), functions)
  const bundle = await bundled(t, { project: relative(import.meta.dirname, project).replaceAll('\\', '/') })
  const engine = engineOf(t, { makers: { clock: () => clock, providers: () => ({ mine }) } })
  const app: App = await engine.open(bundle.folder, { dataFolder: join(workFolder(t), 'data'), mode: 'test' })
  const ada = await person(app, 'Ada')
  const { run } = notDropped(await app.start('helper', { message: 'Fetch.' }, { as: ada }))
  /** The run of the tool, and the step of it that waits for a yes with its ask, once there is one. */
  const waiting = (): { inner: string; step?: string; ask?: number } => {
    const [one] = (app.runs.find({ top: run }) ?? []).filter((found) => found.flow === 'twoFetches')
    const step = one ? app.runs.read(one.id)?.steps.find((found) => found.state === 'waiting') : undefined
    return { inner: one?.id ?? '', ...(step ? { step: step.name, ask: step.ask } : {}) }
  }
  // The first fetch waits for a yes; after it, the second; after that, the step is made with the first one kept.
  for (const ask of [1, 2]) {
    const ended = (): boolean => ['done', 'failed'].includes(String(app.runs.read(run)?.state))
    await untilAsync(`ask ${ask} waits, or the run ended`, () => waiting().ask === ask || ended())
    const { inner, step } = waiting()
    assert.ok(step, JSON.stringify(app.runs.read(run)))
    app.runs.approve(inner, step, undefined, { n: ask })
  }
  await untilAsync('the run ended', () => ['done', 'failed'].includes(String(app.runs.read(run)?.state)))
  const { inner } = waiting()
  assert.equal(app.runs.read(inner)?.answer, 256, JSON.stringify(app.runs.read(inner)?.steps))
})

test('[23-21] a run that is stopped while a step of it calls a model ends that model call through its signal', async (t) => {
  const { clock } = testClock()
  const project = workFolder(t)
  writeFileSync(join(project, 'tables.ts'), tables)
  writeFileSync(
    join(project, 'functions.ts'),
    `import { flow, model } from 'tentjs'
export const thinker = model('thinker', { provider: 'slow', name: 'm-1', abilities: ['reply'], takes: 100000 })
export const thinking = flow('thinking', { input: {}, run: async ({ step }) => step('think', () => thinker.reply('Think.')) })
`,
  )
  const asked: { began: boolean; ended: boolean } = { began: false, ended: false }
  // A model that answers once its call is ended, or after three seconds where nothing ends it.
  const slow: Provider = {
    async *reply(o: ReplyRequest) {
      asked.began = true
      await new Promise<void>((done) => {
        const timer = setTimeout(done, 3000)
        o.signal.addEventListener('abort', () => {
          asked.ended = true
          clearTimeout(timer)
          done()
        })
      })
      yield { end: { text: 'thought', calls: [] } }
    },
  }
  const bundle = await bundled(t, { project: relative(import.meta.dirname, project).replaceAll('\\', '/') })
  const engine = engineOf(t, { makers: { clock: () => clock, providers: () => ({ slow }) } })
  const app: App = await engine.open(bundle.folder, { dataFolder: join(workFolder(t), 'data'), mode: 'test' })
  const { run } = notDropped(await app.start('thinking', {}, { as: 'system' }))
  await untilAsync('the model was asked', () => asked.began)
  app.runs.stop(run)
  await untilAsync('the run was stopped', () => app.runs.read(run)?.state === 'stopped')
  await new Promise((done) => setTimeout(done, 500))
  assert.equal(asked.ended, true, 'the model call was ended through its signal')
})
