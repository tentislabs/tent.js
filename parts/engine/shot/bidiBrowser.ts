import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { TentError } from '../../core/index.ts'
import { isStored } from '../../core/internal.ts'
import type { Opened } from '../opened.ts'
import type { Bidi } from './bidi.ts'
import { bidiAt } from './bidi.ts'
import type { Browsed, BrowserOpening } from './browsed.ts'
import { endProgram } from './endProgram.ts'
import { firefoxFound, webkitFound } from './enginesFound.ts'
import type { DrawnAt } from './routes.ts'
import { routesOf } from './routes.ts'

/** The failure of an engine that does not speak WebDriver BiDi on this computer: a test in it is not run. */
const notRun = (engine: string, why: string): TentError =>
  new TentError(
    'T0016',
    `${engine} does not speak WebDriver BiDi on this computer (${why}): a test in it is not run.`,
    {
      fields: { engine: 'notRun' },
      fix: 'Run the test where the engine speaks WebDriver BiDi, or open the page in another engine.',
    },
  )

// How long a browser is given to answer that it closes, and a driver to give a session.
const closeTime = 5_000
const sessionTime = 30_000

/** The settings of a Firefox that the engine drives: no window, nothing of its own sent out, and the dark setting and the language asked for. */
function settingsOf(opening: BrowserOpening): string {
  const set: Record<string, string | number | boolean> = {
    'browser.shell.checkDefaultBrowser': false,
    'browser.startup.homepage': 'about:blank',
    'browser.aboutwelcome.enabled': false,
    'datareporting.policy.dataSubmissionEnabled': false,
    'toolkit.telemetry.reportingpolicy.firstRun': false,
    'app.update.disabledForTesting': true,
    'browser.safebrowsing.malware.enabled': false,
    'browser.safebrowsing.phishing.enabled': false,
    'browser.safebrowsing.downloads.enabled': false,
    'network.captive-portal-service.enabled': false,
    'network.connectivity-service.enabled': false,
    'extensions.update.enabled': false,
    // What the browser would send out by itself goes to a port where nothing listens: only this computer is reached.
    'network.proxy.type': 1,
    'network.proxy.http': '127.0.0.1',
    'network.proxy.http_port': 9,
    'network.proxy.ssl': '127.0.0.1',
    'network.proxy.ssl_port': 9,
    'network.proxy.no_proxies_on': 'localhost, 127.0.0.1, [::1]',
    'ui.systemUsesDarkTheme': opening.dark ? 1 : 0,
    'layout.css.prefers-color-scheme.content-override': opening.dark ? 0 : 1,
    ...(opening.language
      ? { 'intl.accept_languages': opening.language, 'intl.locale.requested': opening.language }
      : {}),
  }
  return Object.entries(set)
    .map(([name, value]) => `user_pref(${JSON.stringify(name)}, ${JSON.stringify(value)});`)
    .join('\n')
}

/** Starts Firefox with no window, in a folder of its own, and answers where its WebDriver BiDi listens. */
async function firefoxStarted(
  program: string,
  opening: BrowserOpening,
): Promise<{ bidi: Bidi; end(): Promise<void>; fresh: boolean }> {
  const folder = mkdtempSync(join(tmpdir(), 'tent-firefox-'))
  writeFileSync(join(folder, 'user.js'), settingsOf(opening))
  const browser = spawn(
    program,
    ['-headless', '-no-remote', '-profile', folder, '--remote-debugging-port=0', 'about:blank'],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  )
  // Firefox offers its WebDriver BiDi on a port alone, which playwright-core 1.64 reads from this line too
  // (`supportsPipeTransport` of its Firefox answers false): the port is taken only where it is of this computer.
  const address = await new Promise<string>((done, failed) => {
    let said = ''
    const timer = setTimeout(
      () => failed(new TentError('T0016', 'Firefox did not start within thirty seconds.')),
      30_000,
    )
    const heard = (piece: Buffer): void => {
      said += piece.toString()
      const found = /WebDriver BiDi listening on (ws:\/\/\S+)/.exec(said)
      if (!found) return
      clearTimeout(timer)
      // What the browser writes after the line it was read for is let go, and gathered no more.
      browser.stderr?.off('data', heard)
      browser.stderr?.resume()
      said = ''
      if (new URL(found[1]).hostname === '127.0.0.1') done(found[1])
      else failed(notRun('Firefox', 'it listens on more than this computer'))
    }
    browser.stderr?.on('data', heard)
    browser.on('exit', () => {
      clearTimeout(timer)
      failed(notRun('Firefox', 'it ended before it listened'))
    })
  }).catch(async (error: unknown) => {
    await endProgram(browser, folder, 0)
    throw error
  })
  const bidi = await bidiAt(`${address}/session`).catch(async (error: unknown) => {
    await endProgram(browser, folder, 0)
    throw error
  })
  return { bidi, end: () => endProgram(browser, folder, 0), fresh: true }
}

/** A port that the system gives for nothing that listens yet. */
const freePort = (): Promise<number> =>
  new Promise((done, failed) => {
    const probe = createServer()
    probe.once('error', failed)
    probe.listen(0, '127.0.0.1', () => {
      const at = probe.address()
      probe.close(() => done(typeof at === 'object' && at !== null ? at.port : 0))
    })
  })

/**
 * Starts the WebDriver program of WebKit, asks it for a session that speaks WebDriver BiDi, and answers that.
 * Throws as not run where it gives none.
 */
async function webkitStarted(program: string): Promise<{ bidi: Bidi; end(): Promise<void>; fresh: boolean }> {
  const folder = mkdtempSync(join(tmpdir(), 'tent-webkit-'))
  const port = await freePort()
  // The driver of Safari takes its port as a word of its own, and that of WebKitGTK after an equals sign.
  const args = program.endsWith('safaridriver') ? ['-p', String(port)] : [`--port=${port}`]
  const driver = spawn(program, args, { stdio: ['ignore', 'ignore', 'pipe'] })
  // The driver goes on when its browser closed: it is ended at once.
  const end = (): Promise<void> => endProgram(driver, folder, 0)
  try {
    // The driver is asked again while it starts and refuses, and gives its session within its time or not at all.
    const until = performance.now() + sessionTime
    let asked: Response | undefined
    while (!asked && performance.now() < until)
      asked = await fetch(`http://127.0.0.1:${port}/session`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ capabilities: { alwaysMatch: { webSocketUrl: true } } }),
        signal: AbortSignal.timeout(Math.max(1, until - performance.now())),
      }).catch(() => new Promise<undefined>((done) => setTimeout(() => done(undefined), 100)))
    const told: unknown = asked ? await asked.json().catch(() => undefined) : undefined
    const value: unknown = isStored(told) ? told.value : undefined
    const address: unknown =
      isStored(value) && isStored(value.capabilities) ? value.capabilities.webSocketUrl : undefined
    if (typeof address !== 'string') throw notRun('WebKit', 'its driver gives no WebDriver BiDi')
    return { bidi: await bidiAt(address), end, fresh: false }
  } catch (error) {
    await end()
    throw error instanceof TentError ? error : notRun('WebKit', String(error))
  }
}

/** A value of WebDriver BiDi as a text, the form in which a header is handed. */
const text = (value: string): { type: 'string'; value: string } => ({ type: 'string', value })

/**
 * Takes an app, where its browser reaches it, and how the page is opened. Starts Firefox or WebKit and drives one
 * page of it over WebDriver BiDi. Every request of the page goes through the routes of the engine: one that leaves
 * for another place than the app is made by the engine, under the rule of the guarded fetch, and one for a name of
 * the app's own is answered by the app in this program, which the browser need not find. Answers the page.
 * Throws T0016, as not run where the engine does not speak WebDriver BiDi on this computer.
 */
export async function bidiBrowser(o: Opened, at: DrawnAt, opening: BrowserOpening): Promise<Browsed> {
  const { origin } = at
  const started =
    opening.engine === 'firefox'
      ? await firefoxStarted(await firefoxFound({ test: o.mode === 'test' }), opening)
      : await webkitFound({ test: o.mode === 'test' }).then((program) =>
          program === undefined
            ? Promise.reject(
                notRun(
                  'WebKit',
                  o.mode === 'test' ? 'no pinned build of it has a driver' : 'no driver of it was found',
                ),
              )
            : webkitStarted(program),
        )
  const { bidi } = started
  const end = async (): Promise<void> => {
    await bidi.send('browser.close', {}, closeTime).catch(() => undefined)
    bidi.close()
    await started.end()
  }
  try {
    if (started.fresh) await bidi.send('session.new', { capabilities: {} })
    const tree = await bidi.send('browsingContext.getTree', {})
    const [first] = Array.isArray(tree.contexts) ? tree.contexts : []
    const context = String(Reflect.get(Object(first), 'context'))
    const routes = await routesOf(o, at)
    const lines: string[] = []
    let loads: (() => void)[] = []
    bidi.on('network.beforeRequestSent', (told) => {
      if (told.isBlocked !== true) return
      const request = isStored(told.request) ? told.request : {}
      const id = String(request.request)
      const headers = (Array.isArray(request.headers) ? request.headers : []).map((one): [string, string] => [
        String(Reflect.get(Object(one), 'name')),
        String(Reflect.get(Object(Reflect.get(Object(one), 'value')), 'value')),
      ])
      const routed = routes({ url: String(request.url), method: String(request.method ?? 'GET'), headers })
      if (routed === 'through') return void bidi.send('network.continueRequest', { request: id }).catch(() => undefined)
      void routed
        .then(async (answer) =>
          bidi.send('network.provideResponse', {
            request: id,
            statusCode: answer.status,
            reasonPhrase: answer.statusText || 'OK',
            headers: [...answer.headers].map(([name, value]) => ({ name, value: text(value) })),
            body: { type: 'base64', value: Buffer.from(await answer.arrayBuffer()).toString('base64') },
          }),
        )
        .catch(() => bidi.send('network.failRequest', { request: id }).catch(() => undefined))
    })
    bidi.on('log.entryAdded', (told) => lines.push(`${String(told.level)}: ${String(told.text)}`))
    bidi.on('browsingContext.load', () => {
      const waiting = loads
      loads = []
      for (const one of waiting) one()
    })
    await bidi.send('session.subscribe', {
      events: ['log.entryAdded', 'browsingContext.load', 'network.beforeRequestSent'],
    })
    await bidi.send('network.addIntercept', { phases: ['beforeRequestSent'] })
    await bidi.send('browsingContext.setViewport', { context, viewport: opening.size, devicePixelRatio: 1 })
    // The page tells the app that a test drives it, which the mode `test` alone reads.
    await bidi.send('storage.setCookie', {
      cookie: { name: 'tent_test', value: text('1'), domain: new URL(origin).hostname, path: '/' },
    })
    if (opening.cookie)
      await bidi.send('storage.setCookie', {
        cookie: {
          name: opening.cookie.name,
          value: text(opening.cookie.value),
          domain: new URL(origin).hostname,
          path: '/',
          httpOnly: true,
          sameSite: 'lax',
        },
      })
    // The script that each document runs first, which a program may put another one in the place of.
    let preloaded: string | undefined
    const preload = async (written: string): Promise<void> => {
      if (preloaded !== undefined) await bidi.send('script.removePreloadScript', { script: preloaded })
      preloaded = String((await bidi.send('script.addPreloadScript', { functionDeclaration: written })).script)
    }
    if (opening.preload) await preload(opening.preload)
    const evaluated = async (expression: string, ownership: 'none' | 'root'): Promise<Record<string, unknown>> => {
      const answer = await bidi.send('script.evaluate', {
        expression,
        target: { context },
        awaitPromise: true,
        resultOwnership: ownership,
      })
      if (answer.type === 'exception') {
        const details = isStored(answer.exceptionDetails) ? answer.exceptionDetails : {}
        throw new Error(String(details.text ?? 'The expression threw.'))
      }
      return isStored(answer.result) ? answer.result : {}
    }
    const keys = (values: string[]): Promise<unknown> =>
      bidi.send('input.performActions', {
        context,
        actions: [
          {
            type: 'key',
            id: 'keys',
            actions: values.flatMap((value) => [
              { type: 'keyDown', value },
              { type: 'keyUp', value },
            ]),
          },
        ],
      })
    return {
      engine: opening.engine,
      origin,
      go: async (address) => {
        await bidi.send('browsingContext.navigate', { context, url: address, wait: 'none' })
      },
      async evaluate(expression) {
        const result = await evaluated(`(async () => JSON.stringify(await (${expression})))()`, 'none')
        return typeof result.value === 'string' ? JSON.parse(result.value) : undefined
      },
      async click(at) {
        await bidi.send('input.performActions', {
          context,
          actions: [
            {
              type: 'pointer',
              id: 'mouse',
              parameters: { pointerType: 'mouse' },
              actions: [
                { type: 'pointerMove', x: Math.round(at.x), y: Math.round(at.y), origin: 'viewport' },
                { type: 'pointerDown', button: 0 },
                { type: 'pointerUp', button: 0 },
              ],
            },
          ],
        })
      },
      type: async (written) => {
        await keys([...written])
      },
      enter: async () => {
        await keys([''])
      },
      async files(expression, paths) {
        const element = await evaluated(expression, 'root')
        if (typeof element.sharedId !== 'string') throw new TentError('T0001', 'No field of files was found.')
        await bidi.send('input.setFiles', { context, element: { sharedId: element.sharedId }, files: paths })
      },
      async picture(how = {}) {
        const taken = await bidi.send('browsingContext.captureScreenshot', {
          context,
          origin: how.full ? 'document' : 'viewport',
        })
        return new Uint8Array(Buffer.from(String(taken.data ?? ''), 'base64'))
      },
      console: () => [...lines],
      preload,
      loaded: () =>
        new Promise((done) => {
          loads.push(done)
        }),
      end,
    }
  } catch (error) {
    await end()
    throw error
  }
}
