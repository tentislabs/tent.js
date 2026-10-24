import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Mailer } from '../../engine/index.ts'
import { createEngine, mailboxOf } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { command, dataPlace } from './desks.ts'
import { closing, copyOf } from './projects.ts'

const system = { as: { kind: 'system' } } as const

/** The address of an app of the test on this computer, by the port its engine wrote. */
const atHere = (dataFolder: string, path: string): string =>
  `http://localhost:${JSON.parse(readFileSync(`${dataFolder}/engine.json`, 'utf8')).port}${path}`

test('[45-12] in development a message that was sent shows at /_t/mail to this computer, drawn as its receiver sees it with its links, and is refused from another; tent logs --mail lists it', async (t) => {
  const project = copyOf(t, 'mailed')
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error').map((one) => one.message),
    [],
  )
  const dataFolder = dataPlace(t)
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(built.bundleFolder, { dataFolder, mode: 'development' })
  const message = {
    to: 'ada@example.com',
    subject: 'Your invitation',
    html: '<p>Come in: <a href="https://shop.example.com/join?code=7">join the shop</a></p><script>alert(1)</script>',
    text: 'Come in: https://shop.example.com/join?code=7',
  }
  await app.call('send', { message }, system)
  const here = await app.request(new Request(atHere(dataFolder, '/_t/mail')))
  assert.equal(here.status, 200)
  const page = await here.text()
  assert.match(page, /Your invitation/)
  assert.match(page, /ada@example\.com/)
  assert.match(page, /shop@example\.com/)
  assert.match(String(here.headers.get('content-security-policy')), /script-src 'none'|default-src 'none'/)
  // The message itself, as its receiver sees it: its links open, and nothing of it runs.
  const id = /\/_t\/mail\/([A-Za-z0-9_-]+)/.exec(page)?.[1]
  assert.ok(id, 'the page shows the message in a frame of its own')
  const drawn = await app.request(new Request(atHere(dataFolder, `/_t/mail/${id}`)))
  assert.equal(drawn.status, 200)
  const body = await drawn.text()
  assert.match(body, /<a href="https:\/\/shop\.example\.com\/join\?code=7"[^>]*>join the shop<\/a>/)
  assert.match(body, /<base target="_blank">/)
  assert.match(String(drawn.headers.get('content-security-policy')), /sandbox/)
  // From another computer, or through a proxy, it is not there, in the words of a pass.
  for (const from of ['192.168.1.7', '10.0.0.3']) {
    const far = await app.request(new Request(atHere(dataFolder, '/_t/mail')), { from })
    assert.equal(far.status, 404, from)
    const farOne = await app.request(new Request(atHere(dataFolder, `/_t/mail/${id}`)), { from })
    assert.equal(farOne.status, 404, from)
  }
  const listed: Record<string, unknown> = Object(await command(app, dataFolder, 'logs', { mail: true }))
  const mails: unknown = listed.mails
  assert.ok(Array.isArray(mails))
  assert.equal(Reflect.get(Object(mails[0]), 'subject'), 'Your invitation')
  assert.deepEqual(Reflect.get(Object(mails[0]), 'to'), ['ada@example.com'])
})

test('[45-12] a hundred messages are kept, the newest first, and none in another mode', async (t) => {
  const project = copyOf(t, 'mailed')
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  const dataFolder = dataPlace(t)
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const app = await engine.open(built.bundleFolder, { dataFolder, mode: 'development' })
  for (let i = 0; i < 105; i++)
    await app.call('send', { message: { to: 'ada@example.com', subject: `number ${i}`, text: 'hello' } }, system)
  const listed: Record<string, unknown> = Object(await command(app, dataFolder, 'logs', { mail: true }))
  const subjects = (Array.isArray(listed.mails) ? listed.mails : []).map((one) => Reflect.get(Object(one), 'subject'))
  assert.equal(subjects.length, 100)
  assert.equal(subjects[0], 'number 104')
  assert.equal(subjects[99], 'number 5')
  await engine.close()
  const test = createEngine({ port: 0 })
  closing(t, () => test.close())
  const testData = dataPlace(t)
  const other = await test.open(built.bundleFolder, { dataFolder: testData, mode: 'test' })
  assert.equal((await other.request(new Request(atHere(testData, '/_t/mail')))).status, 404)
})

test('[45-12] the mailbox of an app is one: in the mode test a message is kept in it as a Mailer is handed it, and app.mailbox of a test app reads it', async (t) => {
  const project = copyOf(t, 'mailed')
  const built = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  const handed: unknown[] = []
  const mailer: Mailer = {
    async send(message) {
      handed.push(message)
      return {}
    },
  }
  const engine = createEngine({ port: 0, makers: { mailer: () => mailer } })
  closing(t, () => engine.close())
  const app = await engine.open(built.bundleFolder, { dataFolder: dataPlace(t), mode: 'test' })
  await app.call('send', { message: { to: 'ada@example.com', subject: 'Kept', text: 'hello' } }, system)
  assert.deepEqual(mailboxOf(app), [
    {
      to: [{ address: 'ada@example.com' }],
      from: { address: 'shop@example.com', name: 'The Shop' },
      subject: 'Kept',
      text: 'hello',
    },
  ])
  assert.deepEqual(mailboxOf(app), handed)
  // A test app reads the same mailbox, the one its engine keeps.
  const tested = await testApp({ folder: copyOf(t, 'mailed') })
  closing(t, () => tested.close())
  await tested.call('send', { message: { to: 'bo@example.com', subject: 'Also kept', text: 'hi' } }, system)
  assert.deepEqual(
    tested.mailbox.map((one) => one.subject),
    ['Also kept'],
  )
})
