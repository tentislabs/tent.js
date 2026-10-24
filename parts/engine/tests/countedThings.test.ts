import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { join } from 'node:path'
import test from 'node:test'
import type { Provider, ReplyPart } from '../index.ts'
import { system } from './apps.ts'
import { counting } from './countingApps.ts'
import { liveMoment, untilTried, watcher } from './watching.ts'
import { notDropped } from './started.ts'

const bytes = (text: string): number => new TextEncoder().encode(text).length

/** A server of the test on this computer: what it answers to each path, and its address. */
async function served(t: test.TestContext, answers: Record<string, string>): Promise<string> {
  const server = createServer((request, response) => {
    request.resume()
    request.on('end', () => {
      const answer = answers[String(request.url)] ?? 'nothing'
      response.writeHead(200, { 'content-type': 'application/json', 'content-length': bytes(answer) })
      response.end(answer)
    })
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
  t.after(() => new Promise<void>((done) => server.close(() => done())))
  const address = server.address()
  return `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`
}

/** A provider that asks the server of the test for its answer, as a provider of a real server does. */
const fetching = (origin: string): Provider => ({
  async *reply(o): AsyncGenerator<ReplyPart> {
    const answer = await o.fetch(`${origin}/model`, { method: 'POST', body: JSON.stringify({ say: 'hello' }) })
    const text = String(Object(await answer.json()).text)
    yield { text }
    yield { end: { text, calls: [], units: { tokensIn: 2, tokensOut: 1 } } }
  },
})

test('[21-22] a run adds runs, steps and workedMs; a service call, a fetch of the code, a mail, an upload, a download, a file of the bundle and a watch are counted with their bytes; a model over a service call is counted under the model alone; a model call adds its bytes', async (t) => {
  const answers = {
    '/ship': '{"id":"s1"}',
    '/news': '"Fresh news, and more of it."',
    '/model': '{"text":"From the server."}',
  }
  const origin = await served(t, answers)
  const sent: unknown[] = []
  const run = await counting(t, {
    providers: { mine: fetching(origin) },
    change: (description) => {
      Object.assign(Object(description.services.shipper), { url: origin })
      Object.assign(description, { assets: { note: { file: 'assets/note.txt' } } })
    },
    laid: (folder) => {
      mkdirSync(join(folder, 'assets'), { recursive: true })
      writeFileSync(join(folder, 'assets', 'note.txt'), 'A note of the bundle.')
    },
    engine: {
      makers: {
        mailer: () => ({
          send: async (message) => {
            sent.push(message)
            return {}
          },
        }),
      },
    },
  })
  const { app, counted, sum } = run
  const tidy = notDropped(await app.start('tidy', {}, { as: system }))
  await app.runs.wait(tidy.run)
  assert.equal(await app.call('busy', {}, { as: system }), 'done')
  assert.equal(await app.call('fetchNews', { url: `${origin}/news` }, { as: system }), answers['/news'])
  assert.equal(await app.call('tellNote', { to: 'ada@example.com' }, { as: system }), 'sent')
  assert.equal(sent.length, 1)
  assert.equal(await app.call('shipping', { order: 'o2' }, { as: system }).then(() => 'answered'), 'answered')
  assert.equal(await app.call('writer.reply', ['Hi.'], { as: system }), 'From the server.')
  // An upload and its download, by one visitor, and a file of the bundle.
  const paper = 'The words of a paper.'
  const uploaded = await app.request(
    new Request(`${run.origin}/_t/files?name=paper.txt`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain', 'content-length': String(bytes(paper)), origin: run.origin },
      body: paper,
    }),
  )
  const cookie = uploaded.headers
    .getSetCookie()
    .map((line) => line.split(';')[0])
    .join('; ')
  const id = String(Object(Object(await uploaded.json()).value).id)
  const downloaded = await app.request(new Request(`${run.origin}/_t/files/${id}`, { headers: { cookie } }))
  assert.equal(await downloaded.text(), paper)
  const asset = await app.request(new Request(`${run.origin}/_t/b/assets/note.txt`))
  assert.equal(await asset.text(), 'A note of the bundle.')
  const page = watcher(app, run.origin)
  await page.watch('w1', 'listNotes')
  page.close()
  await untilTried('the watch ended', () => page.closed())
  const rows = await counted()
  assert.equal(sum(rows, 'tidy', 'runs'), 1)
  assert.equal(sum(rows, 'tidy', 'steps'), 2)
  assert.ok(sum(rows, 'tidy', 'workedMs') >= 0)
  assert.equal(sum(rows, 'shipper.ship', 'calls'), 1, 'the call of busy, and none of the model')
  assert.ok(sum(rows, 'shipper.ship', 'ms') > 0)
  assert.equal(sum(rows, 'shipper.ship', 'bytesIn'), bytes(answers['/ship']))
  assert.equal(sum(rows, 'shipper.ship', 'bytesOut'), bytes('{"order":"o1"}'))
  assert.equal(sum(rows, 'shipping', 'calls'), 1)
  assert.equal(sum(rows, 'fetch', 'calls'), 1)
  assert.equal(sum(rows, 'fetch', 'bytesIn'), bytes(answers['/news']))
  assert.equal(sum(rows, 'mail', 'mails'), 1)
  assert.ok(sum(rows, 'mail', 'bytesOut') > bytes('Hello from the shop.'))
  assert.equal(sum(rows, 'files', 'bytesIn'), bytes(paper))
  assert.equal(sum(rows, 'files', 'bytesOut'), bytes(paper))
  assert.equal(sum(rows, 'static', 'calls'), 1)
  assert.equal(sum(rows, 'static', 'bytesOut'), bytes('A note of the bundle.'))
  assert.equal(sum(rows, 'live', 'watches'), 1)
  assert.ok(sum(rows, 'live', 'bytesOut') > 0)
  assert.equal(sum(rows, 'writer', 'bytesIn'), bytes(answers['/model']))
  assert.equal(sum(rows, 'writer', 'bytesOut'), bytes('{"say":"hello"}'))
})

test('[21-22] a connection that stood open for a minute adds 60 to liveSeconds, and livePeak holds the most at one time, with the caller empty', async (t) => {
  const { app, origin, advance, counted, sum } = await counting(t, {
    change: (description) => Object.assign(description.project, { countBy: 'caller' }),
  })
  const first = watcher(app, origin)
  const second = watcher(app, origin)
  await first.watch('w1', 'listNotes')
  await second.watch('w1', 'listNotes')
  // A minute in three steps, so that each sign of life is answered as a page answers it.
  for (let step = 0; step < 3; step++) {
    advance(20_000)
    await liveMoment(20)
  }
  first.close()
  second.close()
  await untilTried('both ended', () => first.closed() && second.closed())
  // The engine closes its ends of the two as a page that left is noticed.
  await liveMoment(20)
  const third = watcher(app, origin)
  await third.watch('w1', 'listNotes')
  third.close()
  await untilTried('the third ended', () => third.closed())
  await liveMoment(20)
  const rows = await counted()
  assert.equal(sum(rows, 'live', 'liveSeconds'), 120)
  assert.equal(sum(rows, 'live', 'livePeak'), 2)
  assert.ok(rows.filter((one) => one.unit === 'livePeak').every((one) => one.caller === ''))
})
