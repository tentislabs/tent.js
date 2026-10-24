import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Reach } from '../page/alive.ts'
import { livingPage } from '../page/browser.ts'
import type { Page } from '../page/types.ts'
import { unlockFor } from '../page/unlock.ts'
import { pageOf, rows } from './drawn.ts'

type Message = Record<string, unknown>

/** Lets what a page started come to its end. */
const settled = () => new Promise((done) => setTimeout(done, 2))

/**
 * What stands for the engine in these tests: an engine that runs one version and answers T0007 for any other, with
 * one live connection that the test speaks through.
 */
function engine(o: { mode?: Page['mode']; fails?: string; moves?: string } = {}) {
  let running = 'v1'
  const sent: { address: string; body?: unknown }[] = []
  const gone: string[] = []
  const loaded: string[][] = []
  const styled: string[][] = []
  const overlays: { findings: unknown[]; blocked: { directive: string; uri: string; unlock: string }[] }[] = []
  const told: Message[] = []
  let tell: (message: Message) => void = () => undefined
  let policy: ((one: { directive: string; uri: string }) => void) | undefined
  const stale = (): object => ({
    ok: false,
    error: { code: 'T0007', name: 'version-gone', message: 'This page is out of date.', running },
  })
  const record = (version: string): Page =>
    pageOf('s', {
      path: '/s',
      version,
      mode: o.mode ?? 'test',
      load: { screen: `browser/s.${version}.js`, parts: [], styles: [`browser/styles.${version}.css`], error: '' },
      answers: [{ what: 'openOrders', input: {}, entry: 'orders', value: [{ id: version }], mark: `mark-${version}` }],
    })
  const reach: Reach = {
    post: async (address, body) => {
      sent.push({ address, body })
      if (Object(body).version !== running) return stale()
      if (address === `/_t/call/${o.fails}`) return { ok: false, error: { code: 'T0002', name: 'bad', message: 'No.' } }
      return { ok: true, value: { by: running, input: Object(body).input } }
    },
    get: async (address) => {
      sent.push({ address })
      const asked = new URL(address, 'http://localhost').searchParams
      if (asked.get('version') !== running) return stale()
      const value = record(running)
      // An engine that moves on once more while a page follows it: the next version runs once the screen is answered.
      if (o.moves) running = o.moves
      return { ok: true, value }
    },
    go: (address) => void gone.push(address),
    load: async (files) => {
      loaded.push(files)
      return files.map(() => ({ name: 's', kind: 'screen' as const }))
    },
    shows: () => '/s',
    styles: async (files) => {
      styled.push(files)
      return () => undefined
    },
    overlay: (shown) => void overlays.push(shown),
    blocked: (heard) => {
      policy = heard
    },
    wait: () => () => undefined,
    random: () => 0.5,
    socket: (_address, on) => {
      queueMicrotask(() => on.opened())
      tell = (message) => on.message(JSON.stringify(message))
      return { send: (text) => void told.push(JSON.parse(text)), close: () => undefined }
    },
  }
  const page = livingPage(record('v1'), [{ name: 's', kind: 'screen' }], reach)
  let drawn = 0
  page.listen(() => {
    drawn += 1
  })
  return {
    page,
    sent,
    gone,
    loaded,
    styled,
    overlays,
    told,
    drawn: () => drawn,
    tell: (message: Message) => tell(message),
    refuse: (directive: string, uri: string) => policy?.({ directive, uri }),
    switched(version: string) {
      running = version
    },
  }
}

const live = { entry: 'orders', live: true }

test('[31-12] a page that is told a new version asks for its screen again under it, loads the files it does not hold, swaps its style files, sends its watches again and is drawn again, with its declared state kept', async () => {
  const far = engine({ mode: 'development' })
  far.page.ask('openOrders', {}, live)
  await settled()
  assert.deepEqual(
    far.told.map((one) => [one.t, one.version, one.have]),
    [['watch', 'v1', 'mark-v1']],
  )
  Object.assign(far.page.state, { tab: 'open' })
  const before = far.drawn()

  far.switched('v2')
  far.tell({ t: 'version', version: 'v2' })
  await settled()
  // The screen is asked for again under the new version, at the address the page shows.
  assert.deepEqual(far.sent, [{ address: '/_t/screen?path=%2Fs&version=v2' }])
  // The module of the screen that the page does not hold is loaded, and the style file is the new one.
  assert.deepEqual(far.loaded, [['browser/s.v2.js']])
  assert.deepEqual(far.styled, [['browser/styles.v2.css']])
  assert.equal(far.page.page.version, 'v2')
  assert.ok(far.drawn() > before, 'the screen is drawn again')
  assert.deepEqual(far.gone, [], 'no address is loaded anew')
  // Its declared state stays, and it holds the answers of the new version.
  assert.deepEqual(far.page.state, { tab: 'open' })
  assert.deepEqual(far.page.ask('openOrders', {}, live)?.value, [{ id: 'v2' }])
  // Drawn again, it sends its watch again, under the new version and with the mark of the new answer.
  assert.deepEqual(far.told.at(-1), {
    t: 'watch',
    id: far.told.at(-1)?.id,
    query: 'openOrders',
    input: {},
    version: 'v2',
    have: 'mark-v2',
  })
  // Every call from then on names the new version.
  assert.deepEqual(await far.page.call('addOrder', { total: 1 }), { by: 'v2', input: { total: 1 } })

  // Told the version it runs already, it asks for nothing.
  const asked = far.sent.length
  far.tell({ t: 'version', version: 'v2' })
  await settled()
  assert.equal(far.sent.length, asked)
})

test('[31-12] a page told a version that was left again before it asked follows the version that runs, with no address loaded anew', async () => {
  const far = engine({ mode: 'development' })
  far.page.ask('openOrders', {}, live)
  await settled()
  // Two saves close together: the page is told of the first version once the second already runs.
  far.switched('v3')
  far.tell({ t: 'version', version: 'v2' })
  await settled()
  assert.deepEqual(
    far.sent.map((one) => one.address),
    ['/_t/screen?path=%2Fs&version=v2', '/_t/screen?path=%2Fs&version=v3'],
  )
  assert.equal(far.page.page.version, 'v3')
  assert.deepEqual(far.gone, [], 'no address is loaded anew')
})

test('[31-17] a call from a page whose version is gone: the page follows the running version and the call is made once, with what the person typed', async () => {
  const far = engine()
  far.page.ask('openOrders', {}, live)
  await settled()
  far.switched('v2')
  // The call is answered T0007 with the version that runs: the page follows it, and sends the call once more.
  const typed = { name: 'What the person typed', total: 12 }
  assert.deepEqual(await far.page.call('addOrder', typed), { by: 'v2', input: typed })
  assert.deepEqual(
    far.sent.map((one) => [one.address, Object(one.body).version]),
    [
      ['/_t/call/addOrder', 'v1'],
      ['/_t/screen?path=%2Fs&version=v2', undefined],
      ['/_t/call/addOrder', 'v2'],
    ],
  )
  assert.deepEqual(Object(far.sent[2].body).input, typed)
  assert.equal(far.page.page.version, 'v2')
  assert.deepEqual(far.gone, [], 'no address is loaded anew, so nothing that was typed is lost')

  // A read from the page follows the same way.
  far.switched('v3')
  far.page.ask('getOrder', { id: 'a' }, {})
  await settled()
  await settled()
  assert.deepEqual(far.page.ask('getOrder', { id: 'a' }, {})?.value, { by: 'v3', input: { id: 'a' } })
  assert.equal(far.page.page.version, 'v3')

  // A call that fails under the new version fails as itself, and the page stays.
  const failing = engine({ fails: 'addOrder' })
  failing.switched('v2')
  await assert.rejects(failing.page.call('addOrder', typed), (thrown) => Object(thrown).code === 'T0002')
  assert.deepEqual(failing.gone, [])
  assert.equal(failing.page.page.version, 'v2')
})

test('[31-17] only where the call fails again for its version does the page load its address anew', async () => {
  const far = engine({ moves: 'v3' })
  far.switched('v2')
  // The engine moves on once more while the page follows: the second try is answered T0007 too.
  await assert.rejects(far.page.call('addOrder', { total: 1 }), (thrown) => Object(thrown).code === 'T0007')
  assert.deepEqual(far.gone, ['/s'])
  assert.equal(
    far.sent.filter((one) => one.address === '/_t/call/addOrder').length,
    2,
    'the call is sent twice at most',
  )
})

test('[31-12] the findings that the engine sends are shown as an overlay, and an empty list takes it away', async () => {
  const far = engine({ mode: 'development' })
  await settled()
  const found = [{ code: 'T1005', message: 'A screen file imports a backend file as its text.', level: 'error' }]
  far.tell({ t: 'findings', findings: found })
  assert.deepEqual(far.overlays, [{ findings: found, blocked: [] }])
  far.tell({ t: 'findings', findings: [] })
  assert.deepEqual(far.overlays.at(-1), { findings: [], blocked: [] })
  // The page itself is as it was: an overlay changes nothing that it holds.
  assert.deepEqual(far.page.ask('openOrders', {}, live)?.value, [{ id: 'v1' }])
  assert.equal(rows.length, 2)
})

test('[21-11@6] in the mode development what the content policy blocked is shown in the overlay with the entry of unlock that would open it', async () => {
  const far = engine({ mode: 'development' })
  await settled()
  far.refuse('script-src-elem', 'https://js.stripe.com/v3/')
  assert.deepEqual(far.overlays, [
    {
      findings: [],
      blocked: [
        {
          directive: 'script-src-elem',
          uri: 'https://js.stripe.com/v3/',
          unlock: "unlock: { scripts: ['https://js.stripe.com'] }",
        },
      ],
    },
  ])
  // What was blocked twice is shown once, and stands beside the findings.
  far.refuse('script-src-elem', 'https://js.stripe.com/v3/')
  far.tell({ t: 'findings', findings: [{ code: 'T8000', message: 'A type does not fit.' }] })
  assert.equal(far.overlays.at(-1)?.blocked.length, 1)
  assert.equal(far.overlays.at(-1)?.findings.length, 1)

  // On test data and on live data nothing listens: the page shows no overlay.
  const quiet = engine({ mode: 'test' })
  await settled()
  quiet.refuse('script-src-elem', 'https://js.stripe.com/v3/')
  assert.deepEqual(quiet.overlays, [])

  // Each thing that the policy blocks has the entry that opens it, and nothing else.
  const entries: [string, string, string][] = [
    ['script-src', 'https://maps.example.com/api.js?key=1', "unlock: { scripts: ['https://maps.example.com'] }"],
    ['script-src-elem', 'http://localhost:4000/a.js', "unlock: { scripts: ['http://localhost:4000'] }"],
    ['style-src-elem', 'https://fonts.example.com/a.css', "unlock: { styles: ['https://fonts.example.com'] }"],
    ['font-src', 'https://fonts.example.com/a.woff2', "unlock: { fonts: ['https://fonts.example.com'] }"],
    ['frame-src', 'https://player.example.com/embed/1', "unlock: { frames: ['https://player.example.com'] }"],
    ['style-src-elem', 'inline', 'unlock: { styleTags: true }'],
    ['script-src', 'eval', 'unlock: { eval: true }'],
    ['script-src', 'wasm-eval', 'unlock: { wasm: true }'],
    ['worker-src', 'blob', 'unlock: { blobWorkers: true }'],
    ['img-src', 'https://img.example.com/a.png', "unlock: { more: { 'img-src': ['https://img.example.com'] } }"],
    ['connect-src', 'wss://live.example.com/socket', "unlock: { more: { 'connect-src': ['wss://live.example.com'] } }"],
  ]
  for (const [directive, uri, unlock] of entries)
    assert.equal(unlockFor({ directive, uri }), unlock, `${directive} ${uri}`)
})
