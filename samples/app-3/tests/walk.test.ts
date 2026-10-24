import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { type Browser, chromium, firefox, webkit } from 'playwright-core'
import { testApp } from 'tentjs/test'
import { bridge } from '../fakes/bridge'
import {
  type App,
  codeOf,
  fakeAll,
  GUIDE,
  HEARD,
  HOOK_SECRET,
  mailCall,
  RECORDING_FILE,
  settle,
  userOf,
} from '../fakes/fakes'

type Engine = 'chromium' | 'firefox' | 'webkit'
type Page = Awaited<ReturnType<App['open']>>

// The walk runs in every engine; `WALK_ENGINES=firefox` runs it in one while the app is worked on.
const ENGINES: Engine[] = ['chromium', 'firefox', 'webkit']
const CHOSEN = process.env.WALK_ENGINES?.split(',') ?? ENGINES

// In this repository the command `tent` is this file, run by the pinned runtime.
const TENT = fileURLToPath(new URL('../../../parts/cli/shell.ts', import.meta.url))

/** Types a command of the app's own command line against a server, with a key, as a person does with `desk`. */
function typedWith(address: string, home: string) {
  return (key: string, words: string[]) =>
    new Promise<{ code: number; out: string; err: string }>((done) => {
      execFile(
        process.execPath,
        [TENT, 'cli', address, ...words],
        { env: { ...process.env, TENT_KEY: key, TENT_AT: address, TENT_HOME: home } },
        (error, out, err) => done({ code: typeof error?.code === 'number' ? error.code : error ? 1 : 0, out, err }),
      )
    })
}

/** Signs a person in through the app's own sign-in screen, with the code the app mailed them, as they would. */
async function signIn(app: App, engine: Engine, email: string, back: string): Promise<Page> {
  const page = await app.open(`/sign-in?back=${encodeURIComponent(back)}`, { engine })
  await page.type('email', email)
  await page.press('Mail me a code')
  await page.text('Check your mail')
  await page.type('code', codeOf(app, email))
  await page.press('Sign in')
  return page
}

/** A browser of the test's own, whose microphone hears a recording or a tone of its own, as its engine can. */
function ownBrowser(engine: Engine): Promise<Browser> {
  if (engine === 'firefox')
    return firefox.launch({
      firefoxUserPrefs: { 'media.navigator.streams.fake': true, 'media.navigator.permission.disabled': true },
    })
  if (engine === 'webkit') return webkit.launch()
  return chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      `--use-file-for-fake-audio-capture=${RECORDING_FILE}`,
      '--autoplay-policy=no-user-gesture-required',
    ],
  })
}

const MAIL = {
  from: 'Linus@Example.com',
  name: 'Linus Ek',
  subject: 'I cannot sign in',
  text: 'I forgot my password. How do I reset a password?',
}

for (const engine of ENGINES.filter((one) => CHOSEN.includes(one))) {
  // A test app lives as long as the test that opened it, so the steps are steps of one test.
  test(`the walk of sample app 3, the help desk, in ${engine}`, async (walk) => {
    const pictures = new URL(`../walk/pictures/${engine}/`, import.meta.url)
    await mkdir(pictures, { recursive: true })
    const keep = async (page: Page, step: number) => {
      await settle()
      await writeFile(new URL(`step-${step}.png`, pictures), await page.picture({ full: true }))
    }

    const app = await testApp({ secrets: { MAIL_HOOK: HOOK_SECRET } })
    const fakes = fakeAll(app)
    const door = await bridge(app)
    const home = await mkdtemp(join(tmpdir(), 'tent-desk-'))
    const desk = typedWith(door.address, home)
    walk.after(async () => {
      await door.close()
      await app.close()
      await rm(home, { recursive: true, force: true })
    })
    // An engine that `app.open` cannot drive on this computer fails here with T0016, which `tent test` names not run.
    const staff = await signIn(app, engine, 'sam@desk.example', '/tickets')
    assert.equal((await staff.text('Every mail to the support address, newest first.')).role, 'paragraph')

    const ticketOfMail = async () => (await app.rows('tickets')).filter((row) => row.subject === MAIL.subject)

    await walk.test(
      `[04-3.1] a faked mail service calls the hook with a signed message: a new ticket stands in the staff list, with no reload (${engine})`,
      async () => {
        assert.equal((await staff.reader()).includes(MAIL.subject), false)
        const answer = await app.incoming('mailReceived', mailCall(MAIL, 'msg_walk_1'))
        assert.equal(answer.status, 200)
        await app.settled()
        const [ticket] = await ticketOfMail()
        assert.ok(ticket, 'the mail became a ticket')
        const row = await staff.block(`ticket-${ticket.id}`)
        assert.match(row.text, /I cannot sign in/)
        assert.match(row.text, /open/i)
        assert.match(row.text, /Linus Ek/)
        const customers = await app.rows('customers')
        assert.ok(customers.some((one) => one.email === 'linus@example.com' && one.name === 'Linus Ek'))
        await keep(staff, 1)
      },
    )

    await walk.test(
      `[04-3.2] the same call again, and one with a wrong signature: no second ticket, and nothing for the wrong one (${engine})`,
      async () => {
        const again = await app.incoming('mailReceived', mailCall(MAIL, 'msg_walk_1'))
        assert.equal(again.status, 200)
        const wrong = await app.incoming(
          'mailReceived',
          mailCall({ ...MAIL, subject: 'A forged mail' }, 'msg_walk_2', Buffer.alloc(32, 7)),
        )
        assert.equal(wrong.status, 401)
        await app.settled()
        assert.equal((await ticketOfMail()).length, 1)
        assert.equal((await app.rows('tickets')).filter((row) => row.subject === 'A forged mail').length, 0)
        const shown = await staff.reader()
        assert.equal(shown.split(`link "${MAIL.subject}"`).length - 1, 1, 'the list shows the ticket once')
        assert.equal(shown.includes('A forged mail'), false)
        await keep(staff, 2)
      },
    )

    await walk.test(
      `[04-3.3] a program reads the tickets through the API with a key, and \`desk ticket-list --json\` with the same key: the tickets both times, and a refusal for a key with no such scope (${engine})`,
      async () => {
        const reader = await app.key({ scopes: ['ticketList', 'getTicket'], roles: ['staff'] })
        const asked = await app.request(
          new Request('http://localhost/api/ticketList', { headers: { authorization: `Bearer ${reader.key}` } }),
        )
        assert.equal(asked.status, 200)
        const listed: unknown = await asked.json()
        assert.ok(Array.isArray(listed))
        const subjects = listed.map((one) => String(Object(one).subject)).sort()
        assert.deepEqual(subjects, (await app.rows('tickets')).map((row) => row.subject).sort())
        assert.ok(subjects.includes(MAIL.subject))

        const typed = await desk(reader.key, ['ticket-list', '--json'])
        assert.equal(typed.code, 0, typed.err)
        const line: unknown = JSON.parse(typed.out)
        assert.equal(Object(line).ok, true)
        const value: unknown = Object(line).value
        assert.ok(Array.isArray(value))
        assert.deepEqual(value.map((one) => String(Object(one).subject)).sort(), subjects)

        const narrow = await app.key({ scopes: ['getTicket'], roles: ['staff'] })
        const refused = await app.request(
          new Request('http://localhost/api/ticketList', { headers: { authorization: `Bearer ${narrow.key}` } }),
        )
        assert.equal(refused.status, 403)
        const refusedTyped = await desk(narrow.key, ['ticket-list', '--json'])
        assert.equal(refusedTyped.code, 1)
        assert.match(refusedTyped.out + refusedTyped.err, /T3101/)
        await keep(staff, 3)
      },
    )

    await walk.test(
      `[04-3.4] staff upload a guide as PDF: its chunks are searchable a moment later (${engine})`,
      async () => {
        await staff.press('Guides')
        await staff.type('title', 'Help desk guide')
        await staff.upload('file', { name: 'guide.pdf', bytes: GUIDE, kind: 'application/pdf' })
        await staff.press('Upload')
        await app.settled()
        assert.equal((await app.rows('guideChunks')).length, 3)
        assert.match((await staff.reader()).replaceAll('\n', ' '), /Help desk guide/)
        await staff.type('question', 'How do I reset a password?')
        await staff.press('Search')
        const found = await staff.block('found')
        assert.match(found.text, /^Help desk guide, page 2/)
        assert.match(found.text, /To reset a password, open Account and press Reset password/)
        await keep(staff, 4)
      },
    )

    // The steps after 4 need the guide: where the page could not upload it, it is uploaded as a page's code does.
    if ((await app.rows('guideChunks')).length === 0) {
      const browser = app.browser({ as: await userOf(app, 'sam@desk.example') })
      const uploaded = await browser.upload(GUIDE, { name: 'guide.pdf', kind: 'application/pdf' })
      await browser.call('addGuide', { title: 'Help desk guide', file: String(Object(Object(uploaded).value).id) })
      await app.settled()
    }

    // The page the staff work on the ticket in: the list's own, or a second one where its link did not move.
    let ticketPage = staff

    await walk.test(
      `[04-3.5] staff ask the agent on a ticket "How do I reset a password?": an answer that names the right page of the guide, written as it arrives (${engine})`,
      async () => {
        await staff.press('Tickets')
        await staff.press(MAIL.subject)
        const moved = (await staff.reader()).includes(`heading "${MAIL.subject}"`)
        const [ticket] = await ticketOfMail()
        assert.ok(ticket)
        // A second press of a link may leave the page where it was (the fault of the report): the staff then open
        // the ticket in a page of its own, signed in anew, so that the rest of the walk is walked.
        if (!moved) ticketPage = await signIn(app, engine, 'sam@desk.example', `/tickets/${ticket.id}`)
        const turn = await ticketPage.say('How do I reset a password?')
        assert.equal(turn.state, 'done')
        assert.ok(turn.steps.some((step) => step.name.includes('findInGuide')))
        const draft = await ticketPage.block('draft')
        assert.match(draft.text, /To reset a password, open Account and press Reset password/)
        assert.match(draft.text, /\(Help desk guide, page 2\)$/)
        await keep(ticketPage, 5)
        assert.ok(moved, 'the link of the ticket in the staff list leads to the ticket')
      },
    )

    await walk.test(
      `[04-3.6] staff ask it to refund the order: a question with "Yes" and "No", and the refund only after "Yes" (${engine})`,
      async () => {
        const turn = await ticketPage.say('Refund the order ord_2001, please')
        assert.equal(turn.asks.length, 1)
        assert.equal((await ticketPage.text('Refund the order ord_2001?')).text, 'Refund the order ord_2001?')
        const asking = await ticketPage.reader()
        assert.match(asking, /button "Yes"/)
        assert.match(asking, /button "No"/)
        assert.equal(fakes.payments.sent.filter((one) => one.call === 'refundOrder').length, 0)
        await keep(ticketPage, 6)
        await ticketPage.press('Yes')
        await app.settled()
        const refunds = fakes.payments.sent.filter((one) => one.call === 'refundOrder')
        assert.equal(refunds.length, 1)
        assert.deepEqual(refunds[0]?.input, { id: 'ord_2001' })
        assert.match((await ticketPage.block('draft')).text, /The order is refunded/)
      },
    )

    await walk.test(
      `[04-3.7] the first provider is switched off: the same answer through the second, and a line in the log (${engine})`,
      async () => {
        fakes.switchWriterOff()
        const before = fakes.replies.backup
        const turn = await ticketPage.say('How do I reset a password?')
        assert.equal(turn.state, 'done')
        assert.ok(fakes.replies.backup > before, 'the second provider answered')
        const draft = await ticketPage.block('draft')
        assert.match(draft.text, /\(Help desk guide, page 2\)$/)
        const runs = await app.runs.find({ flow: 'helper' })
        assert.ok(
          runs.some((run) => JSON.stringify(run.used).includes('"answeredBy":"backup"')),
          'a run counts the backup as what answered',
        )
        await keep(ticketPage, 7)
        // Every try of a model is logged, the docs say: the log of the app is to hold a line of the failed writer.
        const logs = await app.logs({ since: '1 hour', newest: 5000 })
        assert.match(JSON.stringify(logs), /writer/, 'a line of the log names the writer that failed')
      },
    )

    await walk.test(
      `[04-3.9] a chat app connects over MCP and lists the tools: the offered functions with their marks (${engine})`,
      async () => {
        const client = app.mcp({ as: await userOf(app, 'sam@desk.example') })
        const tools = await client.tools()
        const named = new Map(tools.map((tool) => [tool.name, tool]))
        assert.deepEqual([...named.keys()].sort(), ['getTicket', 'ticketList'])
        for (const tool of named.values()) assert.equal(Reflect.get(Object(tool.annotations), 'readOnlyHint'), true)
        await keep(staff, 9)
      },
    )

    await walk.test(
      `[04-3.8] a customer records a spoken question: the question as text, and the answer spoken (${engine})`,
      async () => {
        // A page of `app.open` has no microphone, so this step drives a browser of its own, which records.
        const browser = await ownBrowser(engine)
        try {
          await askAloud(browser)
        } catch (error) {
          // What the page held when the step failed, for the walker to look at.
          const [page] = browser.contexts().flatMap((context) => context.pages())
          await page?.screenshot({ path: fileURLToPath(new URL('step-8-failed.png', pictures)), fullPage: true })
          throw error
        } finally {
          await browser.close()
        }
      },
    )

    /** Ada signs in through the sign-in screen, with the code that the app mailed her, and asks out loud on /ask. */
    async function askAloud(browser: Browser): Promise<void> {
      const context = await browser.newContext({
        locale: 'en-US',
        ...(engine === 'chromium' ? { permissions: ['microphone'] } : {}),
      })
      await context.route(
        (url) => url.hostname !== 'localhost',
        (route) => route.abort(),
      )
      const page = await context.newPage()
      page.setDefaultTimeout(15_000)
      await page.goto(`${door.address}/sign-in?back=/ask`)
      await page.locator('#tent[data-t-alive]').waitFor()
      await page.getByLabel('Email', { exact: true }).fill('ada@desk.example')
      await page.getByRole('button', { name: 'Mail me a code' }).click()
      await page.getByRole('heading', { name: 'Check your mail' }).waitFor()
      await page.getByLabel('Code', { exact: true }).fill(codeOf(app, 'ada@desk.example'))
      await page.getByRole('button', { name: 'Sign in' }).click()
      await page.waitForURL((url) => url.pathname === '/ask')
      await page.locator('#tent[data-t-alive]').waitFor()
      const spoken = fakes.spoken()
      await page.getByRole('button', { name: 'Talk' }).click()
      await page.getByText('Listening, 1 s').waitFor()
      await page.getByRole('button', { name: /^Send/ }).click()
      await page.locator('#question', { hasText: HEARD }).waitFor()
      await page.locator('#answer', { hasText: '(Help desk guide, page 2)' }).waitFor()
      await app.settled()
      assert.ok(fakes.spoken() > spoken, 'the answer was spoken')
      await page.getByText('Press to talk').waitFor()
      await page.screenshot({
        path: fileURLToPath(new URL('step-8.png', pictures)),
        fullPage: true,
        animations: 'disabled',
      })
    }
  })
}
