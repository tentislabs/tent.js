import { isStored } from '../../../core/internal.ts'
import type { Reach } from '../reach.ts'
import type { Words } from '../spoken.ts'
import { ownWords, textOf } from '../spoken.ts'
import type { Bridge } from './bridge.ts'

/** What the reach of a frame is handed by the part that speaks to the chat app. */
export interface Framed {
  bridge: Bridge
  // The app's own address, and whether the chat app lets the frame connect to it.
  origin: string
  connected: boolean
  pass(): string | undefined
  // The path of the screen that the frame shows, and the input of its tool for an address of that screen.
  path(): string
  input(address: string): Record<string, unknown>
  // Asks the screen's tool and answers the record of its page in the wire form, as `/_t/screen` answers.
  screen(input: Record<string, unknown>): Promise<unknown>
  // A call through the chat app worked.
  worked(): void
  // The words of the language of the frame over the framework's own, and the framework's alone where none are given.
  words?: Words
}

/** A tool's answer in the wire form: its value, unwrapped where the layer wrapped it, or its error. */
export function wireOf(result: unknown): unknown {
  if (!isStored(result)) return undefined
  const meta = isStored(result._meta) ? result._meta : {}
  if (result.isError === true) {
    const error = isStored(meta['tent.error']) ? meta['tent.error'] : undefined
    return { ok: false, error: error ?? { code: 'T0009', message: 'The chat app did not answer as it should.' } }
  }
  const held = result.structuredContent
  return { ok: true, value: meta['tent.wrapped'] === true && isStored(held) ? held.value : held }
}

/**
 * What a page in a frame of a chat app reaches the app through. A call and a read are calls of the function's
 * tool, which the chat app makes as its caller; the screen is asked for again through its own tool; an address
 * that is left for is opened by the chat app in the browser. What else the page asks of the app it asks with the
 * pass, and only where the chat app lets the frame connect.
 */
export function chatReach(o: Framed): Reach {
  let search = ''
  const at = (address: string): string => new URL(address, o.origin).href
  const asked = async (address: string, how: RequestInit): Promise<unknown> => {
    const pass = o.pass()
    if (!o.connected || pass === undefined)
      return { ok: false, error: { code: 'T0001', message: textOf(o.words ?? ownWords, 'tent.chat.noConnection') } }
    const headers = { authorization: `Bearer ${pass}`, 'content-type': 'application/json' }
    const answer = await fetch(at(address), { ...how, headers, credentials: 'omit' })
    return answer.json()
  }
  return {
    async post(address, body) {
      const tool = /^\/_t\/(call|read)\/([^/?#]+)$/.exec(address)
      // A member of an agent, and `working`, is no tool: it is reached at the app with the pass, or not at all.
      const member = tool !== null && decodeURIComponent(tool[2]).includes('.')
      if (!tool || member) return asked(address, { method: 'POST', body: JSON.stringify(body) })
      const input = isStored(body) && isStored(body.input) ? body.input : {}
      const wire = wireOf(await o.bridge.request('tools/call', { name: decodeURIComponent(tool[2]), arguments: input }))
      if (tool[1] === 'call' && isStored(wire) && wire.ok === true) o.worked()
      // A call that asks a person first names the app's page where the person says yes: the chat app opens it.
      const error = isStored(wire) && isStored(wire.error) ? wire.error : undefined
      const page = error?.code === 'T7120' && isStored(error.fields) ? error.fields.page : undefined
      if (typeof page === 'string') void o.bridge.request('ui/open-link', { url: page }).catch(() => undefined)
      return wire
    },
    async get(address) {
      if (!address.startsWith('/_t/screen?')) return o.connected ? asked(address, { method: 'GET' }) : undefined
      const path = new URLSearchParams(address.slice('/_t/screen?'.length)).get('path') ?? ''
      // Another screen is no screen of this frame: the page opens its address in the browser instead.
      if (path.split(/[?#]/)[0] !== o.path()) return undefined
      return o.screen(o.input(path))
    },
    go: (address) => void o.bridge.request('ui/open-link', { url: at(address) }).catch(() => undefined),
    moved: () => undefined,
    shows: () => `${o.path()}${search}`,
    address: (written) => {
      search = written ? `?${written}` : ''
    },
    now: () => Date.now(),
    part: () => Promise.resolve(),
    ...(o.connected
      ? {
          socket(address, on) {
            const url = new URL(at(address))
            url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
            url.searchParams.set('pass', o.pass() ?? '')
            const socket = new WebSocket(url)
            socket.addEventListener('open', () => on.opened())
            socket.addEventListener('message', (event) => {
              if (typeof event.data === 'string') on.message(event.data)
            })
            socket.addEventListener('close', () => on.closed())
            return {
              send: (text) => {
                if (socket.readyState === WebSocket.OPEN) socket.send(text)
              },
              close: () => socket.close(),
            }
          },
        }
      : {}),
  }
}
