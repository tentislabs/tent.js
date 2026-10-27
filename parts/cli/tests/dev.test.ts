import assert from 'node:assert/strict'
import type { ChildProcess } from 'node:child_process'
import { spawn } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { TestContext } from 'node:test'
import { test } from 'node:test'
import { measure } from '../../../rig/budgets.ts'
import type { Page } from '../../../rig/browser.ts'
import { browserEngines, inBrowser } from '../../../rig/browser.ts'
import { buildProject } from '../../build/index.ts'
import { boolean, choice, json, list, number, object, text } from '../../core/index.ts'
import { checkValue } from '../../core/internal.ts'
import type { Dev } from '../dev.ts'
import { startDev } from '../dev.ts'
import { tent } from '../shell.ts'
import { copied } from './typed.ts'

const system = { kind: 'system' } as const

// `tent dev` as a program of its own, which a test starts and ends.
const program = fileURLToPath(new URL('./devProgram.ts', import.meta.url))

/** Waits until something holds, and fails where it never does. It waits for what it reads, and for no length of time. */
async function until(what: string, holds: () => boolean | Promise<boolean>, tries = 3000): Promise<void> {
  for (let n = 0; n < tries; n++) {
    if (await holds()) return
    await new Promise((done) => setTimeout(done, 10))
  }
  assert.fail(`never: ${what}`)
}

/** `tent dev` on a copy of the project of these tests, on a port that the system gives, ended when the test ends. */
async function developed(t: TestContext, name: string, o: { fresh?: boolean; port?: number; project?: string } = {}) {
  // The session is ended before its folder is removed: what a test asks for at its end is done in the order asked.
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, name, o.project ?? 'devs')
  const lines: string[] = []
  const dev = await startDev(folder, {
    port: o.port ?? 0,
    out: (line) => lines.push(line),
    ...(o.fresh ? { fresh: true } : {}),
  })
  started = dev
  return { folder, lines, dev, origin: `http://localhost:${dev.port}`, save: saveIn(folder) }
}

/** Saves a file of a project with one text in the place of another, as an editor does: the whole file is written. */
const saveIn =
  (folder: string) =>
  (file: string, from: string, to: string): void => {
    const held = readFileSync(join(folder, file), 'utf8')
    assert.ok(held.includes(from), `${file} holds ${JSON.stringify(from)}`)
    writeFileSync(join(folder, file), held.replace(from, to))
  }

/** Opens an address of the app, and waits until the page has come alive. */
async function alive(page: Page, address: string): Promise<void> {
  await page.goto(address)
  await page.locator('#tent[data-t-alive]').waitFor()
}

/** The titles of the items that the app holds, as its running version answers them. */
const titles = async (dev: Dev): Promise<string[]> =>
  Object(await dev.app().call('allItems', {}, { as: system })).map((row: { title: string }) => row.title)

test('[31-12] development: a saved screen is drawn again with its state kept, a saved backend file changes the next call, a save with an error keeps the last good version and shows the overlay, and fixing it takes the overlay away', async (t) => {
  const { dev, origin, save, lines } = await developed(t, 'dev-saves')
  let heading = 'The first heading'
  let word = 'first'
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await alive(page, `${origin}/?tab=open`)
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      await page.getByText('tab open', { exact: true }).waitFor()
      // What the page holds outside its screen tells whether the address was loaded anew: it never is.
      await page.evaluate(() => void Object.assign(window, { stays: true }))
      const stayed = (): Promise<unknown> => page.evaluate(() => Reflect.get(window, 'stays'))

      // A saved screen is drawn again in place: its state and its address stay.
      const next = `The heading of ${engine}`
      const before = dev.version()
      save('screens.tsx', heading, next)
      heading = next
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      assert.notEqual(dev.version(), before, said)
      assert.equal(await page.getByText('tab open', { exact: true }).count(), 1, said)
      assert.deepEqual([new URL(page.url()).search, await stayed()], ['?tab=open', true], said)

      // A saved backend file changes the next call.
      const version = dev.version()
      save('functions.ts', `'${word}'`, `'${engine}'`)
      word = engine
      await until('the saved backend file runs', () => dev.version() !== version)
      await page.getByRole('button', { name: 'Stamp' }).click()
      await page.getByText(`stamped ${engine}`, { exact: true }).waitFor()
      assert.equal(await stayed(), true, said)

      // A save with an error: no version is switched to, the last good one keeps running, and the pages show why.
      const good = dev.version()
      const broken = "\nexport const broken = query('broken', { rows: items.oldest('createdAt') })\n"
      const whole = readFileSync(join(dev.folder, 'functions.ts'), 'utf8')
      writeFileSync(join(dev.folder, 'functions.ts'), whole + broken)
      const overlay = page.locator('#tent-overlay')
      await overlay.waitFor()
      assert.match(await overlay.innerText(), /T\d{4}/, said)
      assert.match(await overlay.innerText(), /broken/, said)
      assert.equal(dev.version(), good, said)
      const held = (await titles(dev)).length
      await page.getByRole('button', { name: 'Add one' }).click()
      await page.getByText(`${held + 1} items`, { exact: true }).waitFor()
      // Fixing it takes the overlay away.
      writeFileSync(join(dev.folder, 'functions.ts'), whole)
      await overlay.waitFor({ state: 'detached' })
      assert.equal(await stayed(), true, said)
    })
  // What was found was said in the terminal too, and each version that was switched to.
  assert.ok(lines.some((line) => /broken/.test(line)))
  assert.ok(lines.some((line) => /runs at http:\/\/localhost:\d+ \(development\)/.test(line)))
})

test('[31-12] development: a save after a view changed its declared state with set draws the saved view with that state, and no error', async (t) => {
  const { origin, save } = await developed(t, 'dev-set-saved', { project: 'devWords' })
  let heading = '<h1>{greeting}</h1>'
  let saved = ''
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await alive(page, `${origin}/`)
      await page.getByRole('heading', { name: `Hello${saved}`, exact: true }).waitFor()
      await page.getByRole('button', { name: 'Name' }).click()
      await page.getByRole('heading', { name: `Hello Ada${saved}`, exact: true }).waitFor()
      saved = ` in ${engine}`
      const next = `<h1>{greeting}${saved}</h1>`
      save('screens.tsx', heading, next)
      heading = next
      await page.getByRole('heading', { name: `Hello Ada${saved}`, exact: true }).waitFor()
      assert.equal(await page.getByText('Something went wrong').count(), 0, said)
      assert.equal(await page.getByText('The first word.', { exact: true }).count(), 1, said)
    })
})

test('[31-12] development: a saved language file is shown on the open page, with no address loaded anew', async (t) => {
  const { origin, save } = await developed(t, 'dev-messages-saved', { project: 'devWords' })
  let word = 'The first word.'
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await alive(page, `${origin}/`)
      await page.getByText(word, { exact: true }).waitFor()
      await page.evaluate(() => void Object.assign(window, { stays: true }))
      const next = `The word of ${engine}.`
      save(join('messages', 'en.ts'), word, next)
      word = next
      await page.getByText(word, { exact: true }).waitFor()
      assert.equal(await page.evaluate(() => Reflect.get(window, 'stays')), true, said)
    })
})

test('[22-17] development: the image door serves each address of an asset that the first HTML names', async (t) => {
  const { origin } = await developed(t, 'dev-picture', { project: 'devWords' })
  const html = await (await fetch(`${origin}/picture`)).text()
  const named = [...html.matchAll(/(\/_t\/img\/a\/[^\s",]+)/g)].map((one) => one[1].replaceAll('&amp;', '&'))
  assert.ok(named.length > 0, html)
  for (const address of new Set(named)) {
    const answer = await fetch(`${origin}${address}`)
    assert.deepEqual([answer.status, answer.headers.get('content-type')], [200, 'image/png'], address)
    assert.equal(answer.headers.get('cache-control'), 'public, max-age=31536000, immutable', address)
  }
})

test('[31-11@6] development: a page whose browser is refused the file of the version it follows loads its address anew, and shows what was saved', async (t) => {
  const { origin, save } = await developed(t, 'dev-saves')
  let heading = 'The first heading'
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      await alive(page, `${origin}/?tab=open`)
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      await page.evaluate(() => void Object.assign(window, { stays: true }))
      // The next file of the bundle that the page asks for is gone, as after a second save removed its folder.
      let refused = 0
      await page.route('**/_t/b/**', (route) =>
        refused++ ? route.continue() : route.fulfill({ status: 404, contentType: 'text/plain', body: 'gone' }),
      )
      const next = `The heading of ${engine}, anew`
      save('screens.tsx', heading, next)
      heading = next
      await page.getByRole('heading', { name: heading, exact: true }).waitFor()
      assert.ok(refused > 0, said)
      // The address was loaded anew, as it stood: nothing that the page held outside its screen is left.
      assert.deepEqual(
        [new URL(page.url()).search, await page.evaluate(() => Reflect.get(window, 'stays'))],
        ['?tab=open', undefined],
        said,
      )
    })
})

test('[31-10@6] development: a page that was sent as Not found hears of the save that adds its screen, and shows it with no address loaded anew', async (t) => {
  const { origin, folder } = await developed(t, 'dev-later')
  let n = 0
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      const said = `in ${engine}`
      const path = `/later-${++n}`
      const answer = await page.goto(`${origin}${path}`)
      assert.equal(answer?.status(), 404, said)
      await page.getByText('This page could not be found.').first().waitFor()
      await page.evaluate(() => void Object.assign(window, { stays: true }))
      // The save adds a screen at the address that the page shows.
      const file = join(folder, 'screens.tsx')
      const added = `\nexport const later${n} = screen('later${n}', { path: '${path}', access: 'anyone', view: () => <h1>Here since save ${n}</h1> })\n`
      writeFileSync(file, readFileSync(file, 'utf8') + added)
      await page.getByRole('heading', { name: `Here since save ${n}`, exact: true }).waitFor()
      assert.equal(await page.evaluate(() => Reflect.get(window, 'stays')), true, said)
    })
})

test('[50-5@6] development: a save that has a tenant table moves the rows of the development data at once, into the file of each tenant, and a save that takes it back moves them out again', async (t) => {
  // The project of the tests of a move: its notes stand in the shared file, and its signs keep files from the start.
  const moving = fileURLToPath(new URL('../../test/tests/moving', import.meta.url))
  let started: Dev | undefined
  t.after(() => started?.close())
  const folder = copied(t, 'dev-move', moving)
  const dev = await startDev(folder, { port: 0, out: () => undefined })
  started = dev
  const teams: string[] = []
  for (const name of ['North', 'South'])
    teams.push(String(Object(await dev.app().call('addTeam', { name }, { as: system })).id))
  for (const [i, team] of teams.entries())
    await dev.app().write(
      [1, 2, 3].map((n) => ({ add: 'notes', values: { team, body: `note ${n} of ${i}` } })),
      { as: system },
    )
  const fileOf = (team: string): string => join(folder, '.tent', 'tenants', 'teams', team.slice(-2), `${team}.db`)
  const bodies = async (): Promise<string[]> => {
    const read: string[] = []
    for (const team of teams)
      for (const row of Object(await dev.app().read({ from: 'notes', of: team }, { as: system })))
        read.push(String(row.body))
    return read.sort()
  }
  const all = ['note 1 of 0', 'note 1 of 1', 'note 2 of 0', 'note 2 of 1', 'note 3 of 0', 'note 3 of 1']
  assert.deepEqual(
    teams.map((team) => existsSync(fileOf(team))),
    [false, false],
  )

  // The save makes the notes a tenant table, with their team as the tenant: the rows are moved, with no word of the builder.
  const save = saveIn(folder)
  const before = dev.version()
  save('tables.ts', '  // where the notes live\n', "  tenant: 'team',\n")
  await until('the saved version runs', () => dev.version() !== before)
  assert.deepEqual(
    teams.map((team) => existsSync(fileOf(team))),
    [true, true],
  )
  assert.deepEqual(await bodies(), all)
  // And back: the rows stand in the shared file again.
  const tenanted = dev.version()
  save('tables.ts', "  tenant: 'team',\n", '  // where the notes live\n')
  await until('the version that keeps them together runs', () => dev.version() !== tenanted)
  assert.deepEqual(
    Object(await dev.app().read({ from: 'notes' }, { as: system }))
      .map((row: { body: string }) => row.body)
      .sort(),
    all,
  )
})

test('[31-12] development: a type error shows in the overlay and does not hold the switch', async (t) => {
  const { dev, origin, save } = await developed(t, 'dev-types')
  await inBrowser('chromium', async (page) => {
    await alive(page, `${origin}/`)
    await page.getByRole('heading', { name: 'The first heading', exact: true }).waitFor()
    // One save holds a change of the screen and a line that only the type checker refuses: a number for a text.
    const whole = readFileSync(join(dev.folder, 'functions.ts'), 'utf8')
    writeFileSync(join(dev.folder, 'functions.ts'), whole.replace("['stamped', 'first'].join(' ')", '7'))
    save('screens.tsx', 'The first heading', 'The heading beside a type error')
    // The switch is not held: the new heading is drawn. The finding of the type checker arrives when it is ready.
    await page.getByRole('heading', { name: 'The heading beside a type error', exact: true }).waitFor()
    const overlay = page.locator('#tent-overlay')
    await overlay.waitFor({ timeout: 120_000 })
    assert.match(await overlay.innerText(), /T8000/)
    assert.match(await overlay.innerText(), /functions\.ts/)
    // Mended, the overlay goes.
    writeFileSync(join(dev.folder, 'functions.ts'), whole)
    await overlay.waitFor({ state: 'detached', timeout: 120_000 })
    await page.getByRole('heading', { name: 'The heading beside a type error', exact: true }).waitFor()
  })
})

test('[14-8] in development, saving a table file adds the column to the development database, and the rows stay', async (t) => {
  const { dev, save } = await developed(t, 'dev-tables')
  assert.deepEqual(await titles(dev), ['seeded'])
  const before = dev.version()
  save('tables.ts', 'columns: { title: text() },', 'columns: { title: text(), colour: text({ optional: true }) },')
  await until('the saved table file runs', () => dev.version() !== before)
  // The column is in the development database: a row is written with it, and the row that stood is still there.
  await dev.app().write([{ add: 'items', values: { title: 'coloured', colour: 'red' } }], { as: system })
  const rows: { title: string; colour?: string }[] = Object(await dev.app().read({ from: 'items' }, { as: 'system' }))
  assert.deepEqual(
    rows.map((row) => [row.title, row.colour]),
    [
      ['seeded', undefined],
      ['coloured', 'red'],
    ],
  )
  // A table change that is refused is a finding like any other: the version that ran keeps running.
  const good = dev.version()
  save('tables.ts', 'title: text(), ', '')
  await until('the refused table change was found', () => dev.findings().some((one) => one.code === 'T2002'))
  assert.equal(dev.version(), good)
  assert.equal((await titles(dev)).length, 2)
  // A version that no page and no run needs is dropped, and its list is removed: the list of the one that runs is
  // left, beside the store of the files.
  const builds = join(dev.folder, '.tent', 'build')
  assert.deepEqual(readdirSync(builds).sort(), [`${good}.json`, 'files'])
  assert.deepEqual(
    dev
      .app()
      .versions()
      .map((one) => [one.id, one.running]),
    [[good, true]],
  )
})

test('[14-8] [31-12] in development, saving a screen file updates an open page within the budget', async (t) => {
  const { dev, origin, save } = await developed(t, 'dev-budget')
  await inBrowser('chromium', async (page) => {
    await alive(page, `${origin}/`)
    let heading = 'The first heading'
    let round = 0
    const middle = await measure(
      'save.seen',
      async () => {
        const next = `Heading ${++round}`
        // The page itself says when it shows the heading: a wait that asks again and again adds its own pauses.
        const seen = page.evaluate(
          (text) =>
            new Promise<void>((done) => {
              const shows = (): boolean => document.querySelector('h1')?.textContent === text
              if (shows()) return done()
              const watching = new MutationObserver(() => {
                if (!shows()) return
                watching.disconnect()
                done()
              })
              watching.observe(document.body, { subtree: true, childList: true, characterData: true })
            }),
          next,
        )
        const began = performance.now()
        save('screens.tsx', heading, next)
        heading = next
        await seen
        return performance.now() - began
      },
      { unit: 'ms', warm: true },
    )
    assert.ok(middle > 0)
    assert.equal(round, 6)
    assert.ok(dev.version().length > 0)
  })
})

// The bar is held on an install as it ships (`shipped.test.ts`): the same measure of the parts as source files is
// written beside it, and held to nothing.
test('[31-12] tent dev of the parts as source files, from the command to a usable page, is measured', async (t) => {
  const folder = copied(t, 'dev-start', 'devs')
  // The page code and the modules of the project are made once and kept: the measure is of a start that finds them.
  const first = await startDev(folder, { port: 0, out: () => undefined })
  await first.close()
  // The command is typed as a person types it: each measure is of a program of its own, from its start.
  const programs = new Set<ChildProcess>()
  t.after(() => {
    for (const one of programs) one.kill()
  })
  const middle = await measure(
    'dev.page.source',
    async () => {
      const began = performance.now()
      const child = spawn(process.execPath, [program, '--port', '0'], {
        cwd: folder,
        stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
      })
      programs.add(child)
      const ended = new Promise<void>((done) => child.once('exit', () => done()))
      let said = ''
      child.stderr?.setEncoding('utf8').on('data', (piece: string) => {
        said += piece
      })
      await until('the line that tent dev says it listens with', () => /:\d+ \(/.test(said) || child.exitCode !== null)
      const port = Number(/:(\d+) \(/.exec(said)?.[1])
      assert.ok(port > 0, `tent dev said: ${said}`)
      const page = await fetch(`http://localhost:${port}/`)
      assert.equal(page.status, 200)
      assert.match(await page.text(), /The first heading/)
      const took = performance.now() - began
      // The program is told to end as Ctrl+C ends it, and has ended before the next one starts on the same data.
      child.send('end')
      await ended
      programs.delete(child)
      return took
    },
    { unit: 'ms' },
  )
  assert.ok(middle > 0)
})

test('[31-12] development: the module of a screen is served with a source map that holds the source of its screen file and nothing of a backend file, and a release bundle holds no map', async (t) => {
  const { dev, origin, folder } = await developed(t, 'dev-source')
  const page = await (await fetch(`${origin}/outside`)).text()
  const record = JSON.parse(/<script type="application\/json" id="tent-page">(.*?)<\/script>/s.exec(page)?.[1] ?? '{}')
  const view: string = record.load.screen
  // A module of development is named at its address with no fingerprint, and with its mark.
  assert.match(view, /^browser\/.+\.js\?v=[0-9a-f]{12}$/)
  // The module of the view imports the screen file's own, which holds its code: in development each file is a module.
  const file = /"\.\/(src\.[\w.-]+\.js)\?v=[0-9a-f]{12}"/.exec(
    await (await fetch(`${origin}/_t/b/${view}`)).text(),
  )?.[1]
  assert.ok(file, 'the module of the view imports the module of its file')
  const module = `browser/${file}`
  const code = await (await fetch(`${origin}/_t/b/${module}`)).text()
  // The module names its map in its last line, by the name of the file that lies beside it, at the module's mark.
  const named = /\n\/\/# sourceMappingURL=(\S+)\n$/.exec(code)?.[1]
  assert.match(
    String(named),
    new RegExp(`^${module.slice('browser/'.length).replaceAll('.', '\\.')}\\.map\\?v=[0-9a-f]{12}$`),
  )
  const answer = await fetch(`${origin}/_t/b/browser/${named}`)
  assert.equal(answer.status, 200)
  const map: { sources: string[]; sourcesContent: (string | null)[] } = Object(await answer.json())
  const sources = map.sourcesContent.join('\n')
  assert.ok(
    map.sources.some((one) => one.endsWith('screens.tsx')),
    map.sources.join(', '),
  )
  assert.ok(sources.includes("script.src = 'http://localhost:9/outside.js'"))
  // A backend file is in no map: neither a line of its code nor a word that only it holds.
  for (const hidden of ["['stamped', 'first']", 'worked out by its own lines', 'a project of the tests'])
    assert.equal(sources.includes(hidden), false, hidden)
  // A map that no file of the bundle lies beside is not served.
  assert.equal((await fetch(`${origin}/_t/b/browser/none.js.map`)).status, 404)
  assert.ok(dev.version().length > 0)
  // A release bundle holds no source: no file of its `browser/` is a map, and no module names one.
  const out = join(folder, '..', 'release')
  const built = await buildProject(folder, { for: 'release', out })
  assert.deepEqual(
    built.findings.filter((one) => one.level === 'error'),
    [],
  )
  const files = readdirSync(join(out, 'browser'))
  assert.deepEqual(
    files.filter((file) => file.endsWith('.map')),
    [],
  )
  for (const file of files.filter((one) => one.endsWith('.js')))
    assert.equal(readFileSync(join(out, 'browser', file), 'utf8').includes('sourceMappingURL'), false, file)
})

test('[21-11@6] in the mode development a blocked script is shown in the overlay with the entry of unlock that would open it', async (t) => {
  const { origin } = await developed(t, 'dev-blocked')
  for (const engine of browserEngines)
    await inBrowser(engine, async (page) => {
      await alive(page, `${origin}/outside`)
      const overlay = page.locator('#tent-overlay')
      await overlay.waitFor()
      const shown = await overlay.innerText()
      assert.match(shown, /http:\/\/localhost:9\/outside\.js/, `in ${engine}`)
      assert.ok(shown.includes("unlock: { scripts: ['http://localhost:9'] }"), `in ${engine}: ${shown}`)
      // The script was not run: the policy of the page is as it was.
      assert.equal(await page.evaluate(() => Reflect.get(window, 'outside')), undefined)
    })
})

test('[15-6@6] tent dev --json answers what it ran when it ends, a second tent dev in one project is refused and names the first, --fresh empties the development data and applies the seed again, and a port that is taken gives the next free one', async (t) => {
  // A session that a failed step leaves running is ended before its folder is removed, so the program ends with the
  // test: what a test asks for at its end is done in the order asked.
  const sessions = new Set<Promise<number>>()
  const session = (words: string[], out: (line: string) => void): Promise<number> => {
    const ended = tent(words, { folder, out })
    sessions.add(ended)
    void ended.finally(() => sessions.delete(ended))
    return ended
  }
  t.after(async () => {
    if (!sessions.size) return
    process.emit('SIGTERM')
    await Promise.allSettled([...sessions])
  })
  const folder = copied(t, 'dev-command', 'devs')
  const engineFile = (): { port: number; pid: number; mode: string } | undefined =>
    existsSync(join(folder, '.tent', 'engine.json'))
      ? JSON.parse(readFileSync(join(folder, '.tent', 'engine.json'), 'utf8'))
      : undefined
  const call = async (name: string, input: object): Promise<unknown> => {
    const answer = await fetch(`http://localhost:${engineFile()?.port}/_t/call/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ input }),
    })
    return Object(await answer.json()).value
  }
  const lines: string[] = []
  const ended = session(['dev', '--port', '0', '--json'], (line) => lines.push(line))
  await until('the engine of tent dev runs', () => engineFile() !== undefined)
  assert.deepEqual([engineFile()?.mode, engineFile()?.pid], ['development', process.pid])
  // New data is seeded, and a write of the session stays in it.
  assert.deepEqual(Object(await call('allItems', {})).length, 1)
  await call('addItem', { title: 'added' })

  // A second `tent dev` in the same project is refused: it names the program that holds the data.
  const second: string[] = []
  const refused = await session(['dev', '--port', '0', '--json'], (line) => second.push(line))
  const said = Object(JSON.parse(second.join('\n')))
  assert.equal(refused, 1)
  assert.deepEqual([said.ok, said.findings[0].code], [false, 'T0013'])
  assert.match(String(said.findings[0].message), new RegExp(`program ${process.pid}`))

  // The signal that ends a program ends `tent dev`, which closes its engine first, and then says what it ran.
  const port = engineFile()?.port
  process.emit('SIGTERM')
  assert.equal(await ended, 0)
  const answer = Object(JSON.parse(lines.join('\n')))
  const shape = object({
    ok: boolean(),
    value: object({
      app: text(),
      version: text({ pattern: '^[0-9a-f]{32}$' }),
      port: number(),
      mode: choice(['development']),
    }),
    findings: list(json()),
  })
  assert.deepEqual(checkValue(shape, answer), [], 'the shape of tent dev --json')
  assert.deepEqual([answer.value.app, answer.value.port, answer.value.mode], ['notes', port, 'development'])
  assert.equal(engineFile(), undefined)

  // Started again, the data is as it was left: nothing is seeded twice. A port that is taken gives the next free one.
  const taken = createServer()
  await new Promise<void>((done) => taken.listen(0, '127.0.0.1', done))
  t.after(() => taken.close())
  const held = Object(taken.address()).port
  const again = session(['dev', '--port', String(held)], () => undefined)
  await until('the second session runs', () => engineFile() !== undefined)
  assert.ok(Number(engineFile()?.port) > held, `the port ${engineFile()?.port} is the next free one after ${held}`)
  assert.deepEqual(
    Object(await call('allItems', {})).map((row: { title: string }) => row.title),
    ['seeded', 'added'],
  )
  process.emit('SIGTERM')
  assert.equal(await again, 0)

  // `--fresh` empties the development data and applies the seed again.
  const fresh = session(['dev', '--port', '0', '--fresh'], () => undefined)
  await until('the fresh session runs', () => engineFile() !== undefined)
  assert.deepEqual(
    Object(await call('allItems', {})).map((row: { title: string }) => row.title),
    ['seeded'],
  )
  process.emit('SIGTERM')
  assert.equal(await fresh, 0)
})

test('[15-6@6] tent dev takes no --phone and no --as, and tent has no command of a pass: a development app answers this computer alone, and a browser is a user by the sign-in of the app', async (t) => {
  const folder = copied(t, 'dev-no-phone', 'devs')
  for (const [words, told] of [
    [['dev', '--phone', '--json'], 'tent dev takes no --phone.'],
    [['dev', '--as', 'someone', '--json'], 'tent dev takes no --as.'],
    [['as', 'someone', '--json'], 'tent has no command "as".'],
  ] as const) {
    const lines: string[] = []
    const ended = await tent([...words], { folder, out: (line) => lines.push(line) })
    const said = Object(JSON.parse(lines.join('\n')))
    assert.deepEqual([ended, said.ok], [2, false], words.join(' '))
    assert.ok(String(said.findings[0].message).startsWith(told), `${words.join(' ')}: ${said.findings[0].message}`)
  }
  assert.equal(existsSync(join(folder, '.tent', 'engine.json')), false, 'no engine was started')
})
