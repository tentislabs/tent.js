import { useEffect, useState } from 'react'
import { screen, read, Link, Form } from 'tentjs/ui'
import { rowScreen } from './browser'
import { addOrder, failing, openOrders, rates } from './functions'

// What follows a call, written as an arrow; a call that fails and is tried again; and a press inside a row.
export const followsScreen = screen('followsScreen', {
  path: '/follows',
  access: 'anyone',
  data: { orders: read(openOrders, { limit: 50 }) },
  view: ({ orders, calls }) => (
    <main style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <h1>{orders.length} orders</h1>
      <Form call={addOrder} with={{ name: 'Arrowed', total: 1 }} then={(order) => ({ goTo: rowScreen, with: { name: order.name } })}><button type="submit">
        Add and open it
      </button></Form>
      <Form call={addOrder} with={{ name: 'Stayed', total: 1 }} then={() => ({ goTo: undefined })}><button type="submit">
        Add and stay
      </button></Form>
      <Form call={failing} id="tried"><button type="submit">
        {calls.tried.busy ? 'Trying' : calls.tried.error ? calls.tried.error.code : 'Try'}
      </button></Form>
      <Link to={rowScreen} with={{ name: 'Outer' }} style={{ display: 'flex', flexDirection: 'row', gap: 8 }}>
        <span>Row words</span>
        <Form call={addOrder} with={{ name: 'Inner', total: 1 }}><button type="submit">
          Mark it
        </button></Form>
      </Link>
    </main>
  ),
})

// Two entries that the page does not wait for: one that answers, and one that fails. The rest of the screen stands.
export const waitsScreen = screen('waitsScreen', {
  path: '/waits',
  access: 'anyone',
  data: {
    orders: read(openOrders, { limit: 50 }),
    slow: read(rates, { base: 'EUR' }, { wait: false }),
    bad: read(failing, {}, { wait: false }),
  },
  view: ({ orders, slow, calls }) => (
    <main>
      <h1>{orders.length} orders</h1>
      <span>{calls.slow.busy ? 'Asking' : `Later ${slow?.EUR}`}</span>
      <span>{calls.bad.busy ? 'Asking the bad one' : calls.bad.error ? `Bad ${calls.bad.error.code}` : 'No error'}</span>
    </main>
  ),
})

// The smallest module of WebAssembly: its eight first bytes, and nothing else.
const smallestModule = [0, 97, 115, 109, 1, 0, 0, 0]

/** Tries each thing that an entry of `unlock` opens, and tells what came of each. `out` is another host. */
function tried(out: string, say: (name: string, what: string) => void): void {
  const added = <Kind extends keyof HTMLElementTagNameMap>(kind: Kind, name: string, done: string) => {
    const element = document.createElement(kind)
    element.addEventListener('load', () => say(name, done))
    element.addEventListener('error', () => say(name, 'refused'))
    return element
  }
  const script = added('script', 'scripts', 'ran')
  script.src = `${out}/outside.js`
  document.head.append(script)
  const link = added('link', 'styles', 'read')
  link.rel = 'stylesheet'
  link.href = `${out}/outside.css`
  document.head.append(link)
  const picture = added('img', 'more', 'shown')
  picture.src = `${out}/dot.png`
  new FontFace('Outside', `url(${out}/outside.woff2)`).load().then(
    () => say('fonts', 'loaded'),
    () => say('fonts', 'refused'),
  )
  // A frame says itself that it is shown, and one that the policy holds back is told by the browser.
  window.addEventListener('message', (told) => {
    if (told.data === 'framed') say('frames', 'shown')
  })
  document.addEventListener('securitypolicyviolation', (held) => {
    if (held.effectiveDirective.startsWith('frame-src')) say('frames', 'refused')
  })
  const frame = document.createElement('iframe')
  // An engine that tells a page nothing of a frame it held back still ends the loading of the frame: a frame that
  // has loaded and has said nothing a moment later was not shown.
  frame.addEventListener('load', () => setTimeout(() => say('frames', 'refused'), 500))
  frame.src = `${out}/frame.html`
  document.body.append(frame)
  // A style rule that code adds to the page while it runs.
  const tag = document.createElement('style')
  tag.textContent = '#tagged { color: rgb(1, 2, 3) }'
  document.head.append(tag)
  const tagged = document.getElementById('tagged')
  say('styleTags', tagged && getComputedStyle(tagged).color === 'rgb(1, 2, 3)' ? 'styled' : 'refused')
  try {
    say('eval', String(new Function('return 6 * 7')()) === '42' ? 'made' : 'refused')
  } catch {
    say('eval', 'refused')
  }
  try {
    new WebAssembly.Module(new Uint8Array(smallestModule))
    say('wasm', 'built')
  } catch {
    say('wasm', 'refused')
  }
  try {
    const worker = new Worker(URL.createObjectURL(new Blob(['postMessage(7)'], { type: 'text/javascript' })))
    worker.addEventListener('message', () => say('blobWorkers', 'worked'))
    worker.addEventListener('error', () => say('blobWorkers', 'refused'))
  } catch {
    say('blobWorkers', 'refused')
  }
  // The device: a part that the policy closes is refused at once, whatever the browser would let the page do.
  navigator.geolocation.getCurrentPosition(
    () => say('location', 'given'),
    (failed) => say('location', failed.code === failed.PERMISSION_DENIED ? 'refused' : 'open'),
  )
  // An engine that has no camera and no microphone for a page at all says so: there is nothing for a policy to close.
  const devices: MediaDevices | undefined = navigator.mediaDevices
  for (const [name, asks] of [
    ['camera', { video: true }],
    ['microphone', { audio: true }],
  ] as const)
    if (!devices) say(name, 'none')
    else devices.getUserMedia(asks).then(
      (stream) => {
        for (const track of stream.getTracks()) track.stop()
        say(name, 'given')
      },
      (failed: Error) => say(name, ['NotAllowedError', 'SecurityError'].includes(failed.name) ? 'refused' : 'open'),
    )
}

// A page that needs each entry of `unlock`: it tries each thing once, and shows what came of each.
export const openedScreen = screen('openedScreen', {
  path: '/opened',
  access: 'anyone',
  view: () => {
    const [seen, setSeen] = useState<Record<string, string>>({})
    useEffect(() => {
      const out = new URLSearchParams(window.location.search).get('out') ?? ''
      tried(out, (name, what) => setSeen((before) => (name in before ? before : { ...before, [name]: what })))
    }, [])
    return (
      <main>
        <p id="tagged">Styled by a rule that code added</p>
        <p id="seen">{JSON.stringify(seen)}</p>
      </main>
    )
  },
})
