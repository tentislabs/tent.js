import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import type { Socket } from 'node:net'
import { createServer } from 'node:net'
import { join } from 'node:path'
import type { TestContext } from 'node:test'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import type { Mailer } from '../../engine/index.ts'
import { storedValues } from '../../engine/index.ts'
import type { TestApp } from '../index.ts'
import { testApp } from '../index.ts'
import { testSecrets } from '../secrets.ts'
import { closing, copyOf } from './projects.ts'
import type { Siege } from './sieges.ts'
import { asNobody, besieged, logOf } from './sieges.ts'

type Message = Parameters<Mailer['send']>[0]

const opened = async (t: TestContext): Promise<TestApp> => {
  const app = await testApp({ folder: copyOf(t, 'mailed') })
  closing(t, () => app.close())
  return app
}

/** The code that a call was refused with, or `ok`. */
const codeOf = (call: Promise<unknown>): Promise<string> =>
  call.then(
    () => 'ok',
    (error) => String(error.code),
  )

/** A copy of the project of the mail, with the line of its `mail` taken out where a test wants none. */
function projectOf(t: TestContext, o: { mail?: false } = {}): string {
  const folder = copyOf(t, 'mailed')
  if (o.mail === false) {
    const file = join(folder, 'tent.ts')
    const line = "  mail: { from: { name: 'The Shop', address: 'shop@example.com' } },\n"
    const written = readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
    assert.ok(written.includes(line))
    writeFileSync(file, written.replace(line, ''))
  }
  return folder
}

/** The project of the mail in an engine of its own, in a mode, with the mailer of the test where it gives one. */
async function inMode(
  t: TestContext,
  mode: 'development' | 'test' | 'live',
  o: { mailer?: Mailer; mail?: false; sendMail?: true } = {},
): Promise<Siege> {
  const project = projectOf(t, o)
  const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
  assert.deepEqual(
    made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
    [],
  )
  const { mailer } = o
  return besieged(t, {
    bundle: made.bundleFolder,
    engine: mailer ? { makers: { mailer: () => mailer } } : {},
    open: { mode, address: '*', ...(o.sendMail ? { sendMail: true } : {}) },
  })
}

/** A mailer that keeps what it is handed, and answers what a test says a server answered. */
function kept(answer: () => { refused?: string[] } = () => ({})): { mailer: Mailer; sent: Message[] } {
  const sent: Message[] = []
  return {
    sent,
    mailer: {
      async send(message) {
        sent.push(message)
        return answer()
      },
    },
  }
}

const plain = { to: 'ada@example.com', subject: 'Your order', text: 'It is on its way.' }

test('[22-15] in the mode test a message is in the mailbox as a Mailer is handed it: every address as a record, every list as a list, with replyTo, bcc, and a file that the caller may download read as its bytes', async (t) => {
  const app = await opened(t)
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const omar = await app.user({ email: 'omar@example.com', roles: [] })
  const file = String(await app.as(maya).call('keep', { words: 'the bill', name: 'bill.txt' }))
  await app.as(maya).call('send', {
    message: {
      to: ['ada@example.com', { name: 'Bo Li', address: 'bo@example.com' }],
      cc: 'cy@example.com',
      bcc: ['dee@example.com'],
      replyTo: 'help@example.com',
      subject: 'Your order',
      text: 'It is on its way.',
      html: '<p>It is on its way.</p>',
      headers: { 'List-Unsubscribe': '<https://shop.example/leave>' },
      attach: [file],
    },
  })
  assert.equal(app.mailbox.length, 1)
  const [message] = app.mailbox
  assert.deepEqual(
    { ...message, attach: message.attach?.map((one) => ({ ...one, bytes: Buffer.from(one.bytes).toString('utf8') })) },
    {
      to: [{ address: 'ada@example.com' }, { address: 'bo@example.com', name: 'Bo Li' }],
      from: { address: 'shop@example.com', name: 'The Shop' },
      cc: [{ address: 'cy@example.com' }],
      bcc: [{ address: 'dee@example.com' }],
      replyTo: { address: 'help@example.com' },
      subject: 'Your order',
      text: 'It is on its way.',
      html: '<p>It is on its way.</p>',
      headers: { 'List-Unsubscribe': '<https://shop.example/leave>' },
      attach: [{ name: 'bill.txt', kind: 'text/plain', bytes: 'the bill' }],
    },
  )
  // A file that the caller may not download is refused, and no message leaves. Full access reaches it.
  assert.equal(await codeOf(app.as(omar).call('send', { message: { ...plain, attach: [file] } })), 'T0001')
  assert.equal(await codeOf(app.as(omar).call('send', { message: { ...plain, attach: ['no-file-at-all'] } })), 'T0001')
  assert.equal(app.mailbox.length, 1)
  await app.as(omar).call('sendAsSystem', { message: { ...plain, attach: [file] } })
  assert.equal(app.mailbox.length, 2)
  // `html` alone is taken, and `from` of the message wins over that of the project.
  await app
    .as('nobody')
    .call('send', { message: { to: 'ada@example.com', subject: 'News', html: '<b>new</b>', from: 'news@example.com' } })
  assert.deepEqual(app.mailbox[2], {
    to: [{ address: 'ada@example.com' }],
    from: { address: 'news@example.com' },
    subject: 'News',
    html: '<b>new</b>',
  })
})

test('[22-15] nothing that a person typed adds a receiver or a line to the head of a message: each is T0002, and no message leaves', async (t) => {
  const app = await opened(t)
  const refused: [string, object][] = [
    ['a subject with a line break', { ...plain, subject: 'Hello\r\nBcc: eve@example.com' }],
    ['two addresses in one text', { ...plain, to: 'ada@example.com, eve@example.com' }],
    ['three addresses in one text', { ...plain, to: 'ada@example.com;bo@example.com;eve@example.com' }],
    ['an address with a name around it', { ...plain, to: 'Ada <ada@example.com>' }],
    ['an address with a space', { ...plain, to: 'ada @example.com' }],
    ['an address with two @', { ...plain, to: 'ada@example.com@evil.example' }],
    ['an address with a line break', { ...plain, cc: 'ada@example.com\nBcc: eve@example.com' }],
    ['no address', { ...plain, to: [] }],
    [
      'a name with a line break',
      { ...plain, from: { name: 'Shop\r\nBcc: eve@example.com', address: 'shop@example.com' } },
    ],
    ['a name with a quote', { ...plain, from: { name: 'The "Shop"', address: 'shop@example.com' } }],
    ['a name with an angle bracket', { ...plain, to: { name: 'Ada <eve@example.com>', address: 'ada@example.com' } }],
    ['a header that names Bcc', { ...plain, headers: { Bcc: 'eve@example.com' } }],
    ['a header that names bcc in small letters', { ...plain, headers: { bcc: 'eve@example.com' } }],
    ['a header that names Reply-To', { ...plain, headers: { 'reply-to': 'eve@example.com' } }],
    ['a header whose name holds a colon', { ...plain, headers: { 'X-Note: a\r\nBcc': 'eve@example.com' } }],
    ['a header whose value holds a line break', { ...plain, headers: { 'X-Note': 'a\r\nBcc: eve@example.com' } }],
    ['neither text nor html', { to: 'ada@example.com', subject: 'Empty' }],
    ['no subject', { to: 'ada@example.com', text: 'x' }],
    ['a member that no message has', { ...plain, bccs: ['eve@example.com'] }],
  ]
  for (const [what, message] of refused)
    assert.equal(await codeOf(app.as('nobody').call('send', { message })), 'T0002', what)
  assert.deepEqual(app.mailbox, [])
  await app.as('nobody').call('send', { message: plain })
  assert.equal(app.mailbox.length, 1)
})

test('[22-15] [21-16@7a] the mode says what becomes of mail: in development a message is printed to the log and not sent, also for a project that states no mail, and sent where the engine was told to send; in live it is sent', async (t) => {
  // Development: the head of the message, its text and the names of its files stand in the log, and nothing is sent.
  const printed = kept()
  const dev = await inMode(t, 'development', { mailer: printed.mailer })
  await dev.app.call('send', { message: { ...plain, bcc: 'dee@example.com' } }, asNobody)
  assert.deepEqual(printed.sent, [])
  const lines = logOf(dev.dataFolder, 'lines').map((row) => `${row.message} ${row.data ?? ''}`)
  const line = lines.find((one) => one.includes('Your order'))
  assert.ok(line, lines.join('\n'))
  for (const piece of ['ada@example.com', 'dee@example.com', 'shop@example.com', 'It is on its way.'])
    assert.ok(line.includes(piece), `${piece} in: ${line}`)
  // A project that states no `mail` yet prints too: who it is from is not known, and nothing fails.
  const bare = await inMode(t, 'development', { mail: false })
  await bare.app.call('send', { message: plain }, asNobody)
  assert.ok(logOf(bare.dataFolder, 'lines').some((row) => String(row.message).includes('Your order')))
  // `tent dev --mail` sends in development too.
  const sending = kept()
  const sends = await inMode(t, 'development', { mailer: sending.mailer, sendMail: true })
  await sends.app.call('send', { message: plain }, asNobody)
  assert.equal(sending.sent.length, 1)
  // Live: the message is handed to the mailer of the app.
  const live = kept()
  const shop = await inMode(t, 'live', { mailer: live.mailer })
  await shop.app.call('send', { message: plain }, asNobody)
  assert.deepEqual(live.sent, [
    {
      to: [{ address: 'ada@example.com' }],
      from: { address: 'shop@example.com', name: 'The Shop' },
      subject: 'Your order',
      text: 'It is on its way.',
    },
  ])
})

test('[22-15] with no mailer mail.send is T0020; a message with no sender is T0002; a mailer that takes some addresses and not others is T0021 that names the rest, and one that fails is T0021 with its answer in the log', async (t) => {
  // Neither `mail` in the project nor a mailer of its own.
  const none = await inMode(t, 'live', { mail: false })
  assert.equal(await codeOf(none.app.call('send', { message: { ...plain, from: 'x@example.com' } }, asNobody)), 'T0020')
  // A mailer, and nobody that the message is from.
  const unsigned = kept()
  const noFrom = await inMode(t, 'live', { mail: false, mailer: unsigned.mailer })
  assert.equal(await codeOf(noFrom.app.call('send', { message: plain }, asNobody)), 'T0002')
  assert.deepEqual(unsigned.sent, [])
  // The server took one address and not the other: the message went to the first, and the error names the rest.
  const part = kept(() => ({ refused: ['bo@example.com'] }))
  const some = await inMode(t, 'live', { mailer: part.mailer })
  const two = { ...plain, to: ['ada@example.com', 'bo@example.com'] }
  const failed = await some.app.call('send', { message: two }, asNobody).then(
    () => undefined,
    (error) => error,
  )
  assert.equal(failed?.code, 'T0021')
  assert.match(String(failed?.message), /bo@example\.com/)
  assert.doesNotMatch(String(failed?.message), /ada@example\.com/)
  assert.equal(part.sent.length, 1)
  // The server did not take the message at all: T0021, and the log holds what it answered.
  const down = await inMode(t, 'live', {
    mailer: {
      async send() {
        throw new Error('554 5.7.1 The message was refused as spam')
      },
    },
  })
  assert.equal(await codeOf(down.app.call('send', { message: plain }, asNobody)), 'T0021')
  const errors = logOf(down.dataFolder, 'lines').map((row) => `${row.message} ${row.data ?? ''}`)
  assert.ok(
    errors.some((one) => one.includes('554 5.7.1 The message was refused as spam')),
    errors.join('\n'),
  )
})

test('[22-15] the mailer that ships: a mail server on a private address is refused, and the log holds the answer of a server that refuses a message without the password of the mail secret', async (t) => {
  // A server on this computer that refuses every message before anything is sent, and echoes the password.
  const sockets = new Set<Socket>()
  const server = createServer((socket) => {
    sockets.add(socket)
    socket.on('error', () => undefined)
    socket.end('554 5.7.1 No mail is taken here from shop:the-password\r\n')
  })
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', () => done()))
  closing(
    t,
    () =>
      new Promise<void>((done) => {
        for (const one of sockets) one.destroy()
        server.close(() => done())
      }),
  )
  const port = Number(Reflect.get(Object(server.address()), 'port'))
  /** The project with the server stated as a secret and no mailer of its own: the one that ships sends. */
  const shipped = async (address: string, privateHosts: string[]): Promise<Siege> => {
    const project = copyOf(t, 'mailed')
    const file = join(project, 'tent.ts')
    writeFileSync(
      file,
      readFileSync(file, 'utf8')
        .replace("import { project } from 'tentjs'", "import { project, secret } from 'tentjs'")
        .replace(
          "address: 'shop@example.com' } },",
          `address: 'shop@example.com' }, send: secret('SMTP_URL') },\n  privateHosts: ${JSON.stringify(privateHosts)},`,
        ),
    )
    const made = await buildProject(project, { for: 'dev', out: join(project, 'bundle') })
    assert.deepEqual(
      made.findings.filter((one) => one.level === 'error').map((one) => `${one.code} ${one.message}`),
      [],
    )
    const dataFolder = join(project, 'data')
    testSecrets(dataFolder, made.description, { SMTP_URL: address })
    // A test sends no mail: the mailer that ships sends on live data.
    storedValues(dataFolder, made.description, { kind: 'secrets', live: true, name: 'SMTP_URL', value: address })
    return besieged(t, { bundle: made.bundleFolder, dataFolder, open: { mode: 'live', address: '*' } })
  }
  // A private address that the project does not list: the address rule of the guarded fetch refuses it, by its code.
  const far = await shipped('smtp://shop:the-password@10.0.0.7:587', [])
  assert.equal(await codeOf(far.app.call('send', { message: plain }, asNobody)), 'T0022')
  // A server that the project lists, which refuses the message: T0021, and the log holds its answer, with no password.
  const near = await shipped(`smtp://shop:the-password@127.0.0.1:${port}`, [`127.0.0.1:${port}`])
  assert.equal(await codeOf(near.app.call('send', { message: plain }, asNobody)), 'T0021')
  const lines = logOf(near.dataFolder, 'lines').map((row) => `${row.message} ${row.data ?? ''}`)
  assert.ok(
    lines.some((one) => one.includes('No mail is taken here')),
    lines.join('\n'),
  )
  assert.equal(
    lines.some((one) => one.includes('the-password')),
    false,
    lines.join('\n'),
  )
  assert.equal(sockets.size, 1)
})
