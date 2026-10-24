import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium } from 'playwright-core'
import { testApp } from 'tentjs/test'

type Engine = 'chromium' | 'firefox' | 'webkit'
type App = Awaited<ReturnType<typeof testApp>>
type Page = Awaited<ReturnType<App['open']>>

// The walk runs in every engine; `WALK_ENGINES=firefox` runs it in one while the app is worked on.
const ENGINES: Engine[] = ['chromium', 'firefox', 'webkit']
const CHOSEN = process.env.WALK_ENGINES?.split(',') ?? ENGINES

// Claude Code is the walk's own stand-in, which writes each answer in parts as Claude Code streams it.
process.env.BOTS_CLAUDE = JSON.stringify([process.execPath, join(import.meta.dirname, '..', 'walk', 'slow-claude.ts')])

const SIZE: [number, number] = [1280, 800]

/** Waits until the motion of the page has ended: a dialog's rise, a line that fades in. */
const settle = () => new Promise((done) => setTimeout(done, 700))

/** Signs the person of the seed in through the app's own sign-in screen, as they would. */
async function signIn(app: App, engine: Engine): Promise<Page> {
  const page = await app.open('/sign-in?back=%2Fbots', { engine, size: SIZE })
  await page.type('email', 'sam@example.com')
  await page.type('password', 'a long secret')
  await page.press('Sign in')
  return page
}

/** Says a message in the talk that is open, and keeps each text the answer showed while it was written. */
async function sayAndWatch(page: Page, message: string): Promise<{ texts: string[] }> {
  const texts: string[] = []
  let ended = false
  const said = page.say(message).finally(() => {
    ended = true
  })
  while (!ended) {
    const shown = await page.block('answer').then(
      (found) => found.text,
      () => '',
    )
    if (shown && texts.at(-1) !== shown) texts.push(shown)
    await new Promise((done) => setTimeout(done, 60))
  }
  await said
  return { texts }
}

const botNamed = async (app: App, name: string) => {
  const found = (await app.rows('bots')).find((one) => one.name === name)
  assert.ok(found, `a bot named ${name}`)
  return found
}

for (const engine of ENGINES.filter((one) => CHOSEN.includes(one))) {
  // A test app lives as long as the test that opened it, so the steps are steps of one test.
  test(`the walk of sample app 5, the bots, in ${engine}`, async (walk) => {
    const pictures = new URL(`../walk/pictures/${engine}/`, import.meta.url)
    await mkdir(pictures, { recursive: true })
    const keep = async (page: Page, step: number) => {
      await settle()
      await writeFile(new URL(`step-${step}.png`, pictures), await page.picture())
    }

    const app = await testApp()
    walk.after(() => app.close())
    const calendarService = app.fake('calendar', { createEvent: () => ({ id: 'e1', sent: true }) })
    app.fake('mailbox', { searchMail: () => ({ mails: [{ from: 'ada@example.com', subject: 'A call?' }] }) })
    // An engine that `app.open` cannot drive on this computer fails here with T0016, which `tent test` names not run.
    const page = await signIn(app, engine)

    await walk.test(
      `[04-5.1] makes a bot "Inbox" with a brief and asks it a question: the answer written as it arrives, and the bot in the list with its brief (${engine})`,
      async () => {
        await page.press('New bot')
        await page.type('name', 'Inbox')
        await page.pick('shape', 'hexagon')
        await page.pick('colour', 'teal')
        await page.press('Create')
        await app.settled()
        const inbox = await botNamed(app, 'Inbox')
        await page.text('What should I focus on first?')
        await page.press('Sorting what comes in')
        await app.settled()
        const { texts } = await sayAndWatch(page, 'What is on today?')
        const answer = 'it is written in three parts, as it arrives.'
        assert.ok(
          texts.some((one) => !one.includes(answer) && one.length > 0),
          `the answer stood part-written on the page before it was whole: ${JSON.stringify(texts)}`,
        )
        assert.match((await page.reader()).replace(/\s+/g, ' '), /it is written in three parts, as it arrives\./)
        assert.match((await page.block(`bot-${inbox.id}`)).text, /Inbox/)
        await page.press('Inbox, details')
        assert.match(String((await page.field('brief')).value), /Sorting what comes in/)
        await page.type('brief', 'Reads and sorts my mail, and tells me what needs me.')
        await page.press('Save')
        assert.equal((await botNamed(app, 'Inbox')).brief, 'Reads and sorts my mail, and tells me what needs me.')
        assert.match(String((await page.field('brief')).value), /Reads and sorts my mail/)
        await keep(page, 1)
      },
    )

    await walk.test(
      `[04-5.2] gives Inbox a routine every morning at eight, and the clock moves past eight: a run of Inbox in the list of runs, with no person asking (${engine})`,
      async () => {
        await page.type('every', 'every morning at eight')
        await page.type('task', 'Sort what came in overnight.')
        await page.press('Add routine')
        const inbox = await botNamed(app, 'Inbox')
        const routine = (await app.rows('routines')).find((one) => one.bot === inbox.id)
        assert.ok(routine?.next, 'the routine has its next moment')
        const minutes = Math.ceil((new Date(String(routine.next)).getTime() - Date.now()) / 60000) + 2
        app.clock.advance(`${minutes} minutes`)
        await app.settled()
        const runs = (await page.block('runs')).text
        assert.match(runs, /Sort what came in overnight\./)
        assert.match(runs, /By a routine/)
        await keep(page, 2)
      },
    )

    await walk.test(
      `[04-5.3] tells the chief "Summarise my mail and book a call with Ada": the summary handed to Inbox and the call to Calendar, each run shown under it (${engine})`,
      async () => {
        await page.press('Chief')
        await page.say('Summarise my mail and book a call with Ada')
        await app.settled()
        const chief = await botNamed(app, 'Chief')
        const turns = await app.rows('turns')
        const chiefRun = turns.find((one) => one.bot === chief.id)
        assert.ok(chiefRun, 'the chief ran')
        const under = turns.filter((one) => one.under === chiefRun.run)
        const lines = await Promise.all(under.map(async (one) => (await page.block(`under-${one.run}`)).text))
        assert.equal(lines.length, 2, 'two runs under the chief')
        assert.ok(
          lines.some((one) => /Handed to Inbox: Summarise my mail\./.test(one)),
          lines.join(' | '),
        )
        assert.ok(
          lines.some((one) => /Handed to Calendar: Book a call with Ada\./.test(one)),
          lines.join(' | '),
        )
        await keep(page, 3)
      },
    )

    await walk.test(
      `[04-5.4] Calendar wants to send the invitation: a question with Yes and No in the list of asks, the invitation sent only after Yes, and nothing after No (${engine})`,
      async () => {
        await page.press('1 ask waits for you')
        await page.text('Calendar wants to send the invitation')
        // The fake hears every call of the calendar, its search of free times too: an invitation is a call to createEvent.
        const invites = (): number => calendarService.sent.filter((one) => one.call === 'createEvent').length
        assert.equal(invites(), 0, 'nothing is sent before an answer')
        await page.press('No')
        await app.settled()
        assert.equal(invites(), 0, 'nothing is sent after No')
        const calendar = await botNamed(app, 'Calendar')
        await page.press('Calendar')
        // The run waits for the person once it asks, so its turn does not end: the message is typed and sent.
        await page.type('message', 'Book a call with Ada')
        await page.press('Send')
        await app.settled()
        await page.press('1 ask waits for you')
        await keep(page, 4)
        await page.press('Yes')
        await app.settled()
        assert.deepEqual(
          calendarService.sent.filter((one) => one.call === 'createEvent').map((one) => one.call),
          ['createEvent'],
          'the invitation is sent after Yes',
        )
        assert.ok(calendar)
      },
    )

    await walk.test(
      `[04-5.5] asks Inbox the next day what it did yesterday: an answer from its own memory, and nothing of Calendar's memory (${engine})`,
      async () => {
        app.clock.advance('1 day')
        // A day on, the morning routine of Inbox runs again: it ends before the person asks.
        await app.settled()
        await page.press('Inbox')
        await page.say('What did you do yesterday?')
        await app.settled()
        const inbox = await botNamed(app, 'Inbox')
        const last = (await app.rows('memories'))
          .filter((one) => one.bot === inbox.id && one.who === 'assistant')
          .at(-1)
        assert.ok(last, 'Inbox answered')
        const answer = (await page.block(`said-${last.id}`)).text
        assert.match(answer, /From my own memory/)
        assert.match(answer, /Summarise my mail/)
        assert.doesNotMatch(answer, /Book a call/)
        await keep(page, 5)
      },
    )

    await walk.test(
      `[04-5.6] sets the day's limit low and asks once more: the run refused with the limit's code, and the use of the day shown (${engine})`,
      async () => {
        await page.press('Settings')
        await page.press('Usage & Billing')
        await page.type('dayLimit', '100')
        await page.press('Save')
        assert.match((await page.block('usage')).text, /tokens written today/)
        await page.press('Close')
        await page.press('Inbox')
        await page.say('Once more')
        await app.settled()
        assert.match((await page.block('failed')).text, /day-limit/)
        await keep(page, 6)
      },
    )
  })
}

// In this repository the command `tent` is this file, run by the pinned runtime.
const TENT = fileURLToPath(new URL('../../../parts/cli/shell.ts', import.meta.url))
const WINDOW = fileURLToPath(new URL('../desktop/target/release/bots.exe', import.meta.url))

/** Starts a program of the test's own, and answers it with the first line of its standard error that fits. */
function started(program: string, words: string[], env: NodeJS.ProcessEnv, fits: RegExp) {
  const child = spawn(program, words, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'] })
  const line = new Promise<string>((done, refuse) => {
    let heard = ''
    child.stderr.on('data', (part: Buffer) => {
      heard += part.toString()
      const found = fits.exec(heard)
      if (found) done(found[0])
    })
    child.on('exit', (code) => refuse(new Error(`${program} ended with ${code}: ${heard}`)))
  })
  return { child, line }
}

const freePort = () =>
  new Promise<number>((done) => {
    const server = createServer().listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => done(typeof address === 'object' && address ? address.port : 0))
    })
  })

// The window is Tauri's around the system's own web view, WebView2 on Windows, which this test reaches over its
// debugging port: on another system, or with no window built (`cargo build --release` in desktop/), it is not run.
const windowHere = process.platform === 'win32' && existsSync(WINDOW)

test('[04-5.7] opens the app in its desktop window: the same screens, in the window of the app', {
  skip: windowHere ? false : 'the desktop window is built and driven on Windows, from desktop/target/release',
}, async (step) => {
  const folder = await mkdtemp(join(tmpdir(), 'bots-window-'))
  const project = fileURLToPath(new URL('..', import.meta.url))
  const built = spawnSync(process.execPath, [TENT, 'build', '--out', join(folder, 'bundle')], {
    cwd: project,
    encoding: 'utf8',
  })
  assert.equal(built.status, 0, built.stderr)
  const server = started(
    process.execPath,
    [TENT, 'start', join(folder, 'bundle'), '--mode', 'test', '--seed', '--port', '0', '--data', join(folder, 'data')],
    {},
    /https?:\/\/[^\s]+:\d+/,
  )
  step.after(() => server.child.kill())
  const address = (await server.line).replace(/\/$/, '')
  const debugging = await freePort()
  // The window opens off the screen, as every browser of a test does.
  const window = spawn(WINDOW, [], {
    env: {
      ...process.env,
      BOTS_AT: address,
      BOTS_WINDOW_AT: '-4000,-4000',
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugging}`,
    },
    stdio: 'ignore',
  })
  step.after(() => window.kill())
  let browser: Browser | undefined
  for (let tries = 0; tries < 100 && !browser; tries++)
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugging}`).catch(async () => {
      await new Promise((done) => setTimeout(done, 200))
      return undefined
    })
  assert.ok(browser, 'the window shows a web view')
  step.after(() => browser?.close())
  const view = browser.contexts()[0]
  const shown = view.pages()[0] ?? (await view.waitForEvent('page'))
  await shown.waitForURL(/\/sign-in/, { timeout: 30000 })
  await shown.locator('#tent[data-t-alive]').waitFor()
  await shown.getByLabel('Email').fill('sam@example.com')
  await shown.getByLabel('Password').fill('a long secret')
  await shown.getByRole('button', { name: 'Sign in' }).click()
  await shown.waitForURL(/\/bots$/)
  await shown.locator('#tent[data-t-alive]').waitFor()
  await shown.getByRole('link', { name: 'Chief', exact: true }).waitFor()
  await shown.getByRole('link', { name: 'Calendar', exact: true }).waitFor()
  assert.equal(await shown.getByRole('textbox', { name: 'Message' }).getAttribute('placeholder'), 'Message Chief')
  const pictures = new URL('../walk/pictures/window/', import.meta.url)
  await mkdir(pictures, { recursive: true })
  await settle()
  await writeFile(new URL('step-7.png', pictures), await shown.screenshot())
  await rm(folder, { recursive: true, force: true }).catch(() => undefined)
})
