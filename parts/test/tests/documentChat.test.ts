import assert from 'node:assert/strict'
import { cpSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import type { Provider, ReplyRequest } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { servedLive, signedInLive } from './living.ts'
import { sessionIn } from './sessionIn.ts'

// A guide of two pages: the form feed marks the second.
const guide = 'Shipping takes three days.\fRefunds are given within thirty days of the order.'

/** A meaning of a text in 1536 numbers: one for shipping, one for refunds, and a little of everything. */
function meaningOf(text: string): number[] {
  const meaning = new Array<number>(1536).fill(0)
  meaning[0] = /shipping/i.test(text) ? 1 : 0
  meaning[1] = /refund/i.test(text) ? 1 : 0
  meaning[2] = 0.01
  return meaning
}

/** What the writer answers: it asks the documents first, and then names the page that answers. */
function answerOf(request: ReplyRequest): { text?: string; calls?: { tool: string; with: unknown }[] } {
  const last = request.messages.at(-1)
  if (last?.who === 'user') return { calls: [{ tool: 'findInDocuments', with: { words: String(last.text) } }] }
  const [best] = Array.isArray(last?.result) ? last.result : []
  return { text: `Page ${Reflect.get(Object(best), 'page')}: ${Reflect.get(Object(best), 'text')}` }
}

/** A copy of the project of the document chat, in a folder of its own under the results, which git leaves out. */
function copied(): string {
  const work = mkdtempSync(join(process.cwd(), 'results', 'test', 'documents-'))
  const folder = join(work, 'documents')
  cpSync(join(import.meta.dirname, 'documents'), folder, { recursive: true })
  return folder
}

/** Adds the guide as a document, as the staff, and waits until its pieces are kept. */
async function readInto(app: TestApp): Promise<void> {
  const staff = await app.user({ name: 'Sam', roles: ['staff'] })
  const uploaded = await app.browser({ as: staff }).upload(guide, {
    name: 'guide.txt',
    kind: 'text/plain',
    for: 'addDocument',
    field: 'file',
  })
  const id = String(Reflect.get(Object(uploaded.value), 'id'))
  await app.as(staff).call('addDocument', { title: 'The guide', file: id })
  for (let tries = 0; tries < 500 && (await app.rows('docChunks')).length < 2; tries++)
    await new Promise((done) => setTimeout(done, 10))
}

test('[28-1] the document chat builds for a release, its screen included', async () => {
  const made = await buildProject(copied(), { for: 'release' })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error'),
    [],
  )
  assert.ok(made.description.screens.chatScreen)
})

test('[28-1] on a faked model the document chat reads a file in, answers a question with the right page, and the answer is in the conversation', async (t) => {
  const app = await testApp({ folder: copied() })
  t.after(() => app.close())
  app.fake('embedder', { embed: meaningOf })
  app.fake('writer', answerOf)
  await readInto(app)
  const pieces = await app.rows('docChunks')
  assert.deepEqual(pieces.map((one) => one.page).sort(), [1, 2])
  const maya = await app.user({ name: 'Maya', roles: [] })
  const chat = String(Reflect.get(Object(await app.as(maya).call('newChat', {})), 'id'))
  const answer = await app.as(maya).call('helper', { message: 'How do refunds work?', thread: chat })
  assert.deepEqual(answer, { text: 'Page 2: Refunds are given within thirty days of the order.' })
  const rows = await app.rows('messages')
  assert.deepEqual(
    rows.filter((one) => one.who === 'assistant' && one.text).map((one) => one.text),
    ['Page 2: Refunds are given within thirty days of the order.'],
  )
})

test('[28-1] the screen of the document chat shows the answer as it is written', async (t) => {
  const at = await servedLive(t, { project: 'documents' })
  let go = (): void => undefined
  const held = new Promise<void>((done) => {
    go = done
  })
  t.after(go)
  const embedder: Provider = {
    async embed(o) {
      return { vectors: o.texts.map(meaningOf) }
    },
  }
  const writer: Provider = {
    async *reply(o) {
      const said = answerOf(o)
      if (said.calls) {
        yield {
          end: { text: '', calls: said.calls.map((one, i) => ({ id: `c${i}`, tool: one.tool, input: one.with })) },
        }
        return
      }
      const text = said.text ?? ''
      yield { text: text.slice(0, 7) }
      await held
      yield { text: text.slice(7) }
      yield { end: { text, calls: [] } }
    },
  }
  at.app.standIn('embedder', embedder)
  at.app.standIn('writer', writer)
  const staff = await signedInLive(at, 'Sam', ['staff'])
  const as = { kind: 'user' as const, user: { id: staff.user, roles: ['staff'] } }
  const uploaded = await fetch(`${at.origin}/_t/files?name=guide.txt&for=addDocument&field=file`, {
    method: 'POST',
    headers: { cookie: staff.cookie, origin: at.origin, 'content-type': 'text/plain' },
    body: guide,
  })
  const id = String(Object(Object(await uploaded.json()).value).id)
  await at.app.call('addDocument', { title: 'The guide', file: id }, { as })
  for (let tries = 0; tries < 500; tries++) {
    const kept: unknown = await at.app.read({ from: 'docChunks' }, { as: { kind: 'system' } })
    if (Array.isArray(kept) && kept.length >= 2) break
    await new Promise((done) => setTimeout(done, 10))
  }
  const maya = await signedInLive(at, 'Maya', [])
  const chat = String(
    Reflect.get(
      Object(await at.app.call('newChat', {}, { as: { kind: 'user', user: { id: maya.user, roles: [] } } })),
      'id',
    ),
  )
  await inBrowser('chromium', async (page) => {
    await sessionIn(page, at.origin, maya.cookie)
    await page.goto(`${at.origin}/chats/${chat}`)
    await page.getByLabel('Your question').fill('How do refunds work?')
    await page.getByLabel('Your question').press('Enter')
    // The first part of the answer is shown while the rest is still being written.
    await page.getByText('Page 2:', { exact: true }).waitFor()
    go()
    await page.getByText('Page 2: Refunds are given within thirty days of the order.').waitFor()
  })
})
