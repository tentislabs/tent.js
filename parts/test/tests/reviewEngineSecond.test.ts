import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'
import { buildProject } from '../../build/index.ts'
import { createEngine, replaceSecretKey } from '../../engine/index.ts'
import { testApp } from '../index.ts'
import { appIn, command, readFile } from './desks.ts'
import { current, level, readersHeld } from './many.ts'
import { closing, copyOf, tempOf } from './projects.ts'
import { served } from './served.ts'

test('[20-7] after a person is removed, the words of the files they uploaded that no row holds are kept nowhere', async (t) => {
  const { app, dataFolder } = await appIn(t, copyOf(t, 'reading'))
  const maya = await app.user({ email: 'maya@example.com', roles: [] })
  const words = 'what Maya wrote down for herself alone'
  const id = String(
    await app.call('keep', { base64: Buffer.from(words).toString('base64'), name: 'mine.txt' }, { as: maya }),
  )
  assert.equal(await app.call('words', { id }, { as: maya }), words)
  const removed = Object(
    await command(app, dataFolder, 'data', { what: 'user', do: 'remove', id: String(maya.user?.id), yes: true }),
  )
  assert.equal(removed.removed, true)
  const fingerprint = createHash('sha256').update(words).digest('hex')
  const cache = join(dataFolder, 'cache', 'text')
  const kept = existsSync(cache) ? readdirSync(cache).filter((name) => name.startsWith(fingerprint)) : []
  assert.deepEqual(kept, [], 'the words of a file of a removed person are kept in the cache')
})

test(
  '[22-14] a reader that joins again after a new key holds the rows of a tenant table as its writer sealed them again',
  readersHeld,
  async (t) => {
    const temp = tempOf(t)
    const folder = copyOf(t, 'vaulted')
    writeFileSync(
      join(folder, 'functions.ts'),
      `import { anyone, change, input, link, table, text } from 'tentjs'

const open = anyone('a test reads what only a machine with the key opens')

export const teams = table('teams', { columns: { name: text() }, access: { read: 'anyone', add: 'anyone' } })

// What a team keeps for itself, in a data file of its own: stored encrypted, each value by itself.
export const vault = table('vault', {
  columns: { team: link('teams', { onRemove: 'remove' }), title: text(), note: text({ sealed: true }) },
  tenant: 'team',
  access: { read: 'anyone', add: 'anyone' },
})

export const addTeam = change('addTeam', {
  access: open,
  input: { name: text() },
  set: teams.add({ name: input('name') }),
})

export const keep = change('keep', {
  access: open,
  input: { team: text(), title: text(), note: text() },
  set: vault.of(input('team')).add({ title: input('title'), note: input('note') }),
})
`,
    )
    const app = await testApp({ folder })
    closing(t, () => app.close())
    const home = (name: string): string =>
      join(temp, String(readdirSync(temp).find((one) => one.startsWith('tent-test-'))), name)
    const team = String(Object(await app.call('addTeam', { name: 'the team' }, system)).id)
    await app.call('keep', { team, title: 'a', note: 'what the team keeps' }, system)
    // The writes of the shared file go on after the last write of the team's file.
    for (let i = 0; i < 5; i++) await app.call('addTeam', { name: `team ${i}` }, system)
    const keyOf = (name: string): string => readFileSync(join(home(name), 'secret.key'), 'utf8')
    const near = await app.reader({ secretKey: keyOf('data') })
    closing(t, () => near.close())
    await current(app, near)
    await level(app, near)
    // The writer is stopped, its key replaced, and started again: the reader joins again.
    await app.kill()
    await replaceSecretKey(home('data'))
    await app.restart()
    await app.call('addTeam', { name: 'after the new key' }, system)
    await current(app, near)
    await level(app, near)
    const sealedIn = (name: string): string => {
      const file = join(home(name), 'tenants', 'teams', team.slice(-2), `${team}.db`)
      return String(readFile(file, 'SELECT "note" FROM "vault"')[0]?.note)
    }
    assert.equal(sealedIn('reader-2'), sealedIn('data'), 'the reader holds the row as the old key sealed it')
  },
)

// What a review of the whole found in the second third of `engine`, where it takes a built project to show it:
// each test holds a sentence of a document that the code does not hold, and fails while that stands.

const system = { as: { kind: 'system' } } as const

/** Writes a file of a copy of a project anew, with one text in the place of another, which it must hold. */
function replaced(file: string, from: string, to: string): void {
  const text = readFileSync(file, 'utf8')
  assert.ok(text.includes(from), `${file} holds ${JSON.stringify(from)}`)
  writeFileSync(file, text.replace(from, to))
}

test('[22-14] a setting that is set empties the cache of public screens: a cached screen that shows it shows the new value', async () => {
  const at = await served('cached', {
    change(folder) {
      replaced(
        join(folder, 'tent.ts'),
        "import { boolean, project } from 'tentjs'",
        "import { boolean, project, text } from 'tentjs'",
      )
      replaced(
        join(folder, 'tent.ts'),
        "  state: { dark: { type: boolean(), in: 'device' } },",
        "  state: { dark: { type: boolean(), in: 'device' } },\n  settings: { banner: { type: text({ default: 'the old banner' }), public: true } },",
      )
      const screens = join(folder, 'screens.tsx')
      writeFileSync(
        screens,
        `${readFileSync(screens, 'utf8')}
export const bannerScreen = screen('bannerScreen', {
  path: '/banner',
  access: 'anyone',
  title: 'Banner',
  cache: '5 minutes',
  view: ({ settings }) => <h1>{String(settings.banner)}</h1>,
})
`,
      )
    },
  })
  const page = async (): Promise<string> => (await fetch(`${at.address}/banner`)).text()
  assert.match(await page(), /the old banner/)
  await at.app.values({ kind: 'setting', name: 'banner', value: 'the new banner' })
  assert.match(await page(), /the new banner/, 'the cache of the screen still held the page of the old value')
})

test('[50-7] a row that holds a file and is moved into the file of its tenant keeps its file held, under its tenant', async (t) => {
  const folder = copyOf(t, 'moving')
  replaced(
    join(folder, 'tables.ts'),
    "import { anyone, link, table, text } from 'tentjs'",
    "import { anyone, file, link, table, text } from 'tentjs'",
  )
  replaced(
    join(folder, 'tables.ts'),
    '    body: text(),\n',
    '    body: text(),\n    paper: file({ optional: true }),\n',
  )
  replaced(join(folder, 'tent.ts'), "import { project } from 'tentjs'", "import { anyone, project } from 'tentjs'")
  replaced(
    join(folder, 'tent.ts'),
    "  title: 'Notes that move',",
    "  title: 'Notes that move',\n  uploads: anyone('a test uploads a paper'),",
  )
  const { app, dataFolder } = await appIn(t, folder)
  const team = String(Object(await app.call('addTeam', { name: 'the team' }, system)).id)
  const sent = await app.browser().upload(new TextEncoder().encode('the words of the paper'), {
    name: 'paper.txt',
    kind: 'text/plain',
  })
  const paper = String(Object(sent).value?.id)
  await app.write([{ add: 'notes', values: { team, body: 'a note with its paper', paper } }], { as: 'system' })
  // The version in which the notes are a tenant table, by their team.
  replaced(join(folder, 'tables.ts'), '  // where the notes live\n', "  tenant: 'team',\n")
  const built = await buildProject(folder, { for: 'dev', out: join(folder, '..', 'bundle-tenant') })
  const moved = await app.switch(await app.add(built.bundleFolder), { move: true })
  assert.equal(moved.refused, undefined)
  const holds = readFile(join(dataFolder, 'data.db'), `SELECT * FROM "_t_holds" WHERE "file" = '${paper}'`)
  assert.deepEqual(
    holds.map((one) => [one.tableName, one.of ?? null]),
    [['notes', team]],
    'the hold names no tenant, so no file holds the row that it says holds the paper',
  )
})

/** The members of a file as English writes them: one a line, each with its own name. */
function membersCsv(n: number): string {
  const lines = ['Full name,born,height,joined,team']
  for (let i = 1; i <= n; i++)
    lines.push(`Member ${i},1970-01-${String(1 + (i % 28)).padStart(2, '0')},170,2001-02-03T10:00:00Z,red`)
  return `${lines.join('\n')}\n`
}

test('[45-9] an import of a file of many pages says how far it has come while it runs', async (t) => {
  const folder = copyOf(t, 'imported')
  const { app, dataFolder } = await appIn(t, folder)
  const file = join(folder, 'members.csv')
  writeFileSync(file, membersCsv(5000))
  let ended = false
  const importing = command(app, dataFolder, 'data', {
    what: 'import',
    file,
    with: 'addMember',
    map: ['Full name=name'],
  }).finally(() => {
    ended = true
  })
  const seen: unknown[] = []
  while (!ended) {
    seen.push(await command(app, dataFolder, 'data', { what: 'import', file, progress: true }))
    await new Promise((done) => setTimeout(done, 5))
  }
  const said = Object(await importing)
  assert.equal(said.imported, 5000)
  const between = seen.filter((one) => {
    const done = Number(Object(one).done)
    return done > 0 && done < 5000
  })
  assert.ok(
    between.length > 0,
    `no asking while it ran was told how far it had come: ${JSON.stringify(seen.slice(0, 5))}`,
  )
})

test('[32-13] an export that names no origin takes the first of the app’s own names: its sitemap is written', async (t) => {
  const project = join(mkdtempSync(join(process.cwd(), 'results', 'test', 'review-export-')), 'exported')
  const copied = copyOf(t, 'exported')
  const built = await buildProject(copied, { for: 'release', out: project })
  assert.deepEqual(built.findings, [])
  const engine = createEngine({ port: 0 })
  closing(t, () => engine.close())
  const dataFolder = join(copied, '..', 'data')
  const app = await engine.open(built.bundleFolder, { dataFolder, mode: 'test', address: 'shop.example.com' })
  await app.seed()
  const out = join(copied, '..', 'site')
  await app.export(out, {})
  assert.ok(existsSync(join(out, 'sitemap.xml')), 'an app with a name of its own was exported as if it had none')
  assert.match(readFileSync(join(out, 'robots.txt'), 'utf8'), /Sitemap: https?:\/\/shop\.example\.com/)
})

/** The bytes of a picture of the test: a PNG by its first bytes, and then bytes that a test knows. */
function pictureBytes(size: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(size)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  for (let i = 8; i < size; i++) bytes[i] = (i * 7) % 251
  return bytes
}

test('[45-8] two parts of an upload that are sent at once, as a sender that asks where it stands while its first part is still on its way, never make a file of other bytes', async (t) => {
  const { app } = await appIn(t, copyOf(t, 'uploaded'))
  const origin = 'http://localhost'
  const bytes = pictureBytes(200_000)
  let cookie = ''
  const ask = async (path: string, init: RequestInit & { duplex?: 'half' }): Promise<Response> => {
    const headers = new Headers(init.headers)
    headers.set('origin', origin)
    if (cookie) headers.set('cookie', cookie)
    const answer = await app.request(new Request(`${origin}${path}`, { ...init, headers }))
    const set = answer.headers.getSetCookie().map((one) => one.split(';')[0])
    if (set.length) cookie = set.join('; ')
    return answer
  }
  const valueOf = async (answer: Response): Promise<Record<string, unknown>> =>
    Object(Object(await answer.json()).value)
  const begun = await valueOf(
    await ask('/_t/files?name=scan.png', {
      method: 'POST',
      headers: { 'upload-length': String(bytes.length), 'content-length': '0' },
    }),
  )
  const at = `/_t/files?upload=${String(begun.upload)}`
  const where = async (): Promise<number> =>
    Number((await valueOf(await ask(at, { method: 'POST', headers: { 'content-length': '0' } }))).offset)
  const until = async (offset: number): Promise<void> => {
    for (let tries = 0; tries < 400 && (await where()) < offset; tries++)
      await new Promise((done) => setTimeout(done, 5))
  }
  /** A body that sends its pieces one at a time, each when the test lets it. */
  const stepped = (pieces: Uint8Array[]) => {
    const lets: (() => void)[] = []
    let sent = 0
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        if (sent >= pieces.length) return controller.close()
        if (sent > 0) await new Promise<void>((done) => void lets.push(done))
        controller.enqueue(pieces[sent++])
      },
    })
    return { body, next: () => lets.shift()?.() }
  }
  // The first part states the whole length: half arrives, and then the sender stalls.
  const first = stepped([bytes.slice(0, 100_000), bytes.slice(100_000, 150_000), bytes.slice(150_000)])
  const firstAnswer = ask(at, {
    method: 'POST',
    headers: { 'upload-offset': '0', 'content-length': String(bytes.length) },
    body: first.body,
    duplex: 'half',
  })
  await until(100_000)
  // The sender takes the first part for lost, asks where it stands, and sends the rest from there.
  const second = stepped([bytes.slice(100_000, 150_000), bytes.slice(150_000)])
  const secondAnswer = ask(at, {
    method: 'POST',
    headers: { 'upload-offset': '100000', 'content-length': '100000' },
    body: second.body,
    duplex: 'half',
  })
  await until(150_000)
  // Meanwhile the first part comes back to life.
  first.next()
  await new Promise((done) => setTimeout(done, 100))
  second.next()
  first.next()
  const answers = await Promise.all([firstAnswer, secondAnswer].map((one) => one.then((answer) => answer.json())))
  const stored = answers.map((one) => Object(Object(one).value)).filter((one) => typeof one.id === 'string')
  // Whatever was refused, a file that was taken holds the bytes that were sent, and their number.
  for (const one of stored) {
    assert.equal(one.size, bytes.length, 'the file holds another number of bytes than were sent')
    const back = new Uint8Array(await (await ask(`/_t/files/${String(one.id)}`, { method: 'GET' })).arrayBuffer())
    assert.deepEqual(back, bytes)
  }
})
