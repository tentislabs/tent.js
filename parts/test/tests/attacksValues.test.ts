import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Searcher } from '../../engine/index.ts'
import { readSecrets } from '../../engine/index.ts'
import { copyOf } from './projects.ts'
import { asSystem, asUser, besieged } from './sieges.ts'
import { bytesUnder, calledByBrowser, wireCodeOf, holding, idByEmail, stormed } from './storms.ts'

/** The rows of a table of a file of a data folder, read on the disk beside the engine that holds it. */
function rowsOf(dataFolder: string, file: string, table: string): Record<string, unknown>[] {
  const db = new DatabaseSync(join(dataFolder, file), { readOnly: true })
  try {
    return db.prepare(`SELECT * FROM "${table}"`).all()
  } finally {
    db.close()
  }
}

/** Every text that the log of a data folder keeps, as one text. */
const logged = (dataFolder: string): string =>
  JSON.stringify(['lines', 'errors', 'calls', 'denied'].map((table) => rowsOf(dataFolder, 'logs.db', table)))

test('[05-10.12] an error whose message holds a secret, and a log line that code wrote with one, hold [secret] in the log: as it is, with percent signs and in base64', async (t) => {
  const key = 'sk-live-7d2c41f09a6b:e/3+5'
  const { app, dataFolder } = await stormed(t, 'stormed', { secrets: { PAY_KEY: key } })
  const failed = await calledByBrowser(app, 'tells', { name: 'PAY_KEY' })
  assert.deepEqual([failed.status, wireCodeOf(failed.wire)], [500, 'T0009'])
  assert.equal(wireCodeOf((await calledByBrowser(app, 'writes', { name: 'PAY_KEY' })).wire), 'ok')
  const kept = logged(dataFolder)
  assert.equal(kept.includes('[secret]'), true)
  for (const form of [
    key,
    encodeURIComponent(key),
    Buffer.from(key).toString('base64'),
    Buffer.from(key).toString('base64url'),
  ])
    assert.equal(kept.includes(form), false, form)
  // No file of the data folder holds the value as it is: the secrets file holds it sealed.
  assert.deepEqual(holding(dataFolder, key), [])
  // The key of the secrets is in no log either.
  assert.equal(kept.includes(readFileSync(join(dataFolder, 'secret.key'), 'utf8').trim()), false)
})

test('[05-10.12] a secret that holds a quote or a backslash is [secret] in what code wrote into the log beside its message too', async (t) => {
  const key = 'pw"7c1e\\9a44b2-quoted'
  const { app, dataFolder } = await stormed(t, 'stormed', { secrets: { PAY_KEY: key } })
  assert.equal(wireCodeOf((await calledByBrowser(app, 'writes', { name: 'PAY_KEY' })).wire), 'ok')
  for (const row of rowsOf(dataFolder, 'logs.db', 'lines'))
    for (const value of Object.values(row))
      if (typeof value === 'string') {
        assert.equal(value.includes(key), false, value)
        // What is kept beside the message is JSON: the value stands in it as JSON writes it.
        assert.equal(value.includes(JSON.stringify(key).slice(1, -1)), false, value)
      }
})

test('[05-10.14] [05-10.21] a post to a route from a page of another site is T0004, unless the route names that site, and a route whose access is made with allow and says no is refused', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const posted = async (path: string, site: string | undefined): Promise<[number, string]> => {
    const answer = await app.request(
      new Request(`http://localhost${path}`, { method: 'POST', headers: site ? { origin: site } : {}, body: 'x' }),
    )
    const text = await answer.text()
    return [answer.status, text.startsWith('{') ? String(JSON.parse(text).error?.code) : text]
  }
  assert.deepEqual(await posted('/hooks/own', 'http://localhost'), [200, 'taken'])
  for (const site of ['https://evil.example', 'https://pay.example', 'null', 'http://localhost:1'])
    assert.deepEqual(await posted('/hooks/own', site), [403, 'T0004'], site)
  assert.deepEqual(await posted('/hooks/pay', 'https://pay.example'), [200, 'taken'])
  for (const site of ['https://evil.example', 'http://pay.example', 'https://pay.example.evil.example', 'null'])
    assert.deepEqual(await posted('/hooks/pay', site), [403, 'T0004'], site)
  // A rule made with `allow` that says no.
  const shut = await app.request(new Request('http://localhost/shut'))
  const text = await shut.text()
  assert.equal(text.includes('the rule let the caller in'), false)
  assert.ok([401, 403].includes(shut.status), `${shut.status} ${text}`)
  assert.ok(['T0006', 'T3101'].includes(String(JSON.parse(text).error?.code)), text)
})

test('[05-10.15] [05-10.22] [05-10.34] [05-10.37] a mail whose to, subject, sender or headers would add a receiver or a line to the head is T0002, and no message leaves', async (t) => {
  const { app } = await stormed(t, 'stormed')
  const base = { to: 'ada@example.com', subject: 'Your order', text: 'Thank you.' }
  for (const [what, message] of [
    ['a line break and a second line in to', { ...base, to: 'ada@example.com\r\nBcc: eve@evil.example' }],
    ['a line feed in to', { ...base, to: 'ada@example.com\nBcc: eve@evil.example' }],
    ['a line break in the subject', { ...base, subject: 'Your order\r\nBcc: eve@evil.example' }],
    ['a line feed in the subject', { ...base, subject: 'Your order\nX-Added: 1' }],
    ['a carriage return in the subject', { ...base, subject: 'Your order\rBcc: eve@evil.example' }],
    ['three addresses in one to', { ...base, to: 'ada@example.com, bob@example.com, eve@evil.example' }],
    ['two addresses with a semicolon', { ...base, to: 'ada@example.com;eve@evil.example' }],
    ['two addresses with a space', { ...base, to: 'ada@example.com eve@evil.example' }],
    ['an address in angle brackets', { ...base, to: 'Ada <ada@example.com>' }],
    ['two addresses in one entry of a list', { ...base, to: ['ada@example.com', 'bob@example.com,eve@evil.example'] }],
    ['two addresses in cc', { ...base, cc: 'bob@example.com,eve@evil.example' }],
    ['a line break in replyTo', { ...base, replyTo: 'ada@example.com\r\nBcc: eve@evil.example' }],
    ['a line break in from', { ...base, from: 'shop@example.com\r\nBcc: eve@evil.example' }],
    ['a headers that names Bcc', { ...base, headers: { Bcc: 'eve@evil.example' } }],
    ['a headers that names bcc in small letters', { ...base, headers: { bcc: 'eve@evil.example' } }],
    ['a headers that names BCC', { ...base, headers: { BCC: 'eve@evil.example' } }],
    ['a headers that names To', { ...base, headers: { to: 'eve@evil.example' } }],
    ['a headers that names Cc', { ...base, headers: { CC: 'eve@evil.example' } }],
    ['a headers that names From', { ...base, headers: { from: 'eve@evil.example' } }],
    ['a headers that names Reply-To', { ...base, headers: { 'reply-to': 'eve@evil.example' } }],
    ['a headers that names Subject', { ...base, headers: { SUBJECT: 'another' } }],
    ['a header whose name holds a colon', { ...base, headers: { 'X-One: 1\r\nBcc': 'eve@evil.example' } }],
    ['a header whose name holds a colon alone', { ...base, headers: { 'Bcc:': 'eve@evil.example' } }],
    ['a header whose name holds a space', { ...base, headers: { 'X One': '1' } }],
    ['a header whose value holds a line break', { ...base, headers: { 'X-One': '1\r\nBcc: eve@evil.example' } }],
    [
      'a name of the sender with a line break',
      { ...base, from: { name: 'Shop\r\nBcc: eve@evil.example', address: 'shop@example.com' } },
    ],
    [
      'a name of the sender with a quote',
      { ...base, from: { name: 'Shop" <eve@evil.example>', address: 'shop@example.com' } },
    ],
    [
      'a name of the sender with an angle bracket',
      { ...base, from: { name: 'Shop <eve@evil.example>', address: 'shop@example.com' } },
    ],
    [
      'a name of a receiver with an angle bracket',
      { ...base, to: { name: 'Ada>, <eve@evil.example', address: 'ada@example.com' } },
    ],
    ['a member that no message has', { ...base, envelope: { to: 'eve@evil.example' } }],
  ] as const) {
    const told = await calledByBrowser(app, 'send', { message })
    assert.deepEqual([told.status, wireCodeOf(told.wire)], [400, 'T0002'], what)
  }
  assert.equal(app.mailbox.length, 0)
  // What is one address each is taken, and leaves as it was written.
  const taken = {
    ...base,
    to: ['ada@example.com', { name: 'Bob', address: 'bob@example.com' }],
    headers: { 'List-Unsubscribe': '<https://shop.example/u>' },
  }
  assert.equal(wireCodeOf((await calledByBrowser(app, 'send', { message: taken })).wire), 'ok')
  assert.equal(app.mailbox.length, 1)
  assert.deepEqual(app.mailbox[0].to, [{ address: 'ada@example.com' }, { name: 'Bob', address: 'bob@example.com' }])
})

test('[05-10.26] a body that never ends, sent to an app that states onRequest and identify, is cut at the size limit, and identify is handed no body', async (t) => {
  const { app } = await stormed(t, 'identified', {
    change: [
      [
        'tent.ts',
        '  identify: async ({ request, db }) => {\n    counted()',
        "  onRequest: async (request, next) => next(request),\n  identify: async ({ request, db }) => {\n    counted()\n    if (request.body !== null) throw new Error('identify was handed a body')",
      ],
    ],
  })
  let sent = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      sent += 65_536
      controller.enqueue(new Uint8Array(65_536).fill(0x20))
    },
  })
  const how: RequestInit & { duplex: 'half' } = {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: 'http://localhost', 'company-user': 'maya@example.com' },
    body,
    duplex: 'half',
  }
  const answer = await app.request(new Request('http://localhost/_t/call/whoAmI', how))
  const wire = Object(await answer.json())
  assert.deepEqual([answer.status, wire.error?.code], [413, 'T0003'])
  // `callSize` is 1 MB: the body was read to there, and no further than a few parts past it.
  assert.ok(sent <= 1024 * 1024 + 16 * 65_536, `${sent} bytes were taken of a body that never ends`)
  // With a body that ends, the same request is answered: `identify` named its caller, and was handed no body.
  const maya = await idByEmail(app, 'maya@example.com')
  const whole = await calledByBrowser(app, 'whoAmI', {}, { as: maya, headers: { 'company-user': 'maya@example.com' } })
  assert.deepEqual(whole.wire, { ok: true, value: maya })
})

test('[05-10.41] a copy of the data file holds nothing of a sealed column that can be read, nor of its kept earlier versions', async (t) => {
  const { app, dataFolder } = await stormed(t, 'stormed')
  const [first, second] = ['the first note that is sealed', 'the second text of the same note']
  const row = await calledByBrowser(app, 'keepNote', { title: 'a title that is not sealed', note: first })
  assert.equal(wireCodeOf(row.wire), 'ok', JSON.stringify(row.wire))
  assert.equal(wireCodeOf((await calledByBrowser(app, 'renote', { row: row.wire.value, note: second })).wire), 'ok')
  assert.deepEqual((await calledByBrowser(app, 'notesKept', {}, { read: true })).wire.value, [second])
  // Every file of the data folder but the key: the title stands in it, and neither text of the note.
  const copy = bytesUnder(dataFolder).filter((one) => !one.file.endsWith('secret.key'))
  const holds = (text: string): boolean => copy.some((one) => one.bytes.includes(Buffer.from(text)))
  assert.equal(holds('a title that is not sealed'), true)
  for (const text of [first, second, first.slice(4, 20), second.slice(4, 20)]) assert.equal(holds(text), false, text)
  // A sealed value that is moved to another row does not open.
  const other = await calledByBrowser(app, 'keepNote', { title: 'another', note: 'the note of another row' })
  const db = new DatabaseSync(join(dataFolder, 'data.db'))
  try {
    const sealed = db.prepare('SELECT "note" FROM "vault" WHERE "id" = ?').get(String(other.wire.value))?.note
    assert.equal(typeof sealed, 'string')
    db.prepare('UPDATE "vault" SET "note" = ? WHERE "id" = ?').run(String(sealed), String(row.wire.value))
  } finally {
    db.close()
  }
  await app.restart()
  const read = await calledByBrowser(app, 'notesKept', {}, { read: true })
  assert.equal(
    JSON.stringify(read.wire).split('the note of another row').length - 1 <= 1,
    true,
    JSON.stringify(read.wire),
  )
})

/** The app of the attacks in an engine of its own, with a search of the test, and two users who each wrote five memos. */
async function searchedBy(t: test.TestContext, find: (told: string[]) => string[]) {
  const project = copyOf(t, 'stormed')
  const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const told: string[] = []
  const searcher: Searcher = {
    has: (table) => table === 'memos',
    wrote(_table, id, held) {
      if (held !== undefined) told.push(id)
    },
    find: () => find(told),
  }
  const siege = await besieged(t, {
    bundle: made.bundleFolder,
    engine: { makers: { search: () => searcher } },
    open: { mode: 'test', address: '*' },
  })
  await siege.app.seed()
  const users = Object(await siege.app.read({ from: 'users' }, asSystem))
  const [maya, omar]: string[] = ['maya@example.com', 'omar@example.com'].map((email) =>
    String(users.find((one: { email: string }) => one.email === email).id),
  )
  // The memos of Omar are written first, so that a search which answers every id names his first.
  for (let n = 0; n < 5; n++) await siege.app.call('addMemo', { body: `a memo of omar ${n}` }, asUser(omar))
  for (let n = 0; n < 5; n++) await siege.app.call('addMemo', { body: `a memo of maya ${n}` }, asUser(maya))
  assert.equal(told.length, 10)
  return { siege, maya }
}

test('[05-10.42] a Searcher of the builder’s own that names ids of rows that the caller may not read, and more than the limit, answers the caller limit rows that they may read, and no other', async (t) => {
  // A search that answers every id it was ever told, those of another user first, and takes no notice of the limit.
  const { siege, maya } = await searchedBy(t, (told) => [...told])
  const found: string[] = Object(await siege.app.call('findMemos', { words: 'memo' }, asUser(maya)))
  assert.equal(found.length, 3, JSON.stringify(found))
  for (const body of found) assert.match(body, /^a memo of maya \d$/)
})

test('[05-10.42] a Searcher of the builder’s own that names a million ids answers the caller limit rows that they may read, and no other', async (t) => {
  const { siege, maya } = await searchedBy(t, (told) => [
    ...Array.from({ length: 1_000_000 }, (_, n) => `made-up-${n}`),
    ...told,
  ])
  const found: string[] = Object(await siege.app.call('findMemos', { words: 'memo' }, asUser(maya)))
  assert.equal(found.length, 3, JSON.stringify(found))
  for (const body of found) assert.match(body, /^a memo of maya \d$/)
})

test('[05-10.13] [05-10.25] a value of a secrets file that was moved to another name, and a value of secrets.test put into secrets.live under the same name, does not open', async (t) => {
  const [pay, mail] = ['sk-test-4f9a1c7e2b8d6a30', 'the-key-of-the-mail-0091']
  const { app, dataFolder } = await stormed(t, 'stormed', { secrets: { PAY_KEY: pay, MAIL_KEY: mail } })
  const fileOf = (name: string): Record<string, string> =>
    JSON.parse(readFileSync(join(dataFolder, name), 'utf8')).values
  const write = (name: string, values: Record<string, string>): void =>
    writeFileSync(join(dataFolder, name), JSON.stringify({ format: 'tent.secrets/1', values }))
  const held = fileOf('secrets.test')
  assert.deepEqual(readSecrets(dataFolder).sort(), [pay, mail].sort())
  // Moved to another name of the same file: the two values are swapped, and neither opens.
  write('secrets.test', { PAY_KEY: held.MAIL_KEY, MAIL_KEY: held.PAY_KEY })
  assert.deepEqual(readSecrets(dataFolder), [])
  // Put under a name that the file did not hold.
  write('secrets.test', { PAY_KEY: held.PAY_KEY, ADMIN_KEY: held.MAIL_KEY })
  assert.deepEqual(readSecrets(dataFolder), [])
  // The file as it was, and its values put into the live file under their own names: the test file opens, and of
  // the live file nothing does.
  write('secrets.test', held)
  write('secrets.live', held)
  assert.deepEqual(readSecrets(dataFolder).sort(), [pay, mail].sort())
  write('secrets.test', {})
  assert.deepEqual(readSecrets(dataFolder), [])
  // The engine that runs on the folder opens neither: the use of the secret fails, and tells no value.
  write('secrets.live', {})
  write('secrets.test', { PAY_KEY: held.MAIL_KEY })
  await app.restart()
  const told = await calledByBrowser(app, 'tells', { name: 'PAY_KEY' })
  assert.equal(told.wire.ok, false)
  for (const value of [pay, mail]) assert.equal(JSON.stringify(told.wire).includes(value), false)
})
