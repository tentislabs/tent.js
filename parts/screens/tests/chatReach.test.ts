import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { Bridge } from '../page/chat/bridge.ts'
import { chatReach, wireOf } from '../page/chat/reach.ts'

/** A chat app that answers each request of the frame with what the test gives, and keeps what it was asked. */
function chatApp(answer: (method: string, params: object) => unknown) {
  const asked: { method: string; params: object }[] = []
  const bridge: Bridge = {
    request: async (method, params) => {
      asked.push({ method, params })
      return answer(method, params)
    },
    notify: () => undefined,
    heard: () => undefined,
  }
  return { bridge, asked }
}

/** The reach of a frame that shows the screen at `/orders`, with what it was told of the calls that worked. */
function framed(o: { connected: boolean; answer: (method: string, params: object) => unknown }) {
  const { bridge, asked } = chatApp(o.answer)
  const worked: number[] = []
  const screens: object[] = []
  const reach = chatReach({
    bridge,
    origin: 'https://shop.example.com',
    connected: o.connected,
    pass: () => 'a-pass',
    path: () => '/orders',
    input: () => ({ page: 2 }),
    screen: async (input) => {
      screens.push(input)
      return { ok: true, value: { screen: 'ordersScreen' } }
    },
    worked: () => worked.push(1),
  })
  return { reach, asked, worked, screens }
}

test('[25-9] the answer of a tool in the wire form: a record, a value that the layer wrapped, and a failure with its fields', () => {
  assert.deepEqual(wireOf({ content: [], structuredContent: { id: 'o1' } }), { ok: true, value: { id: 'o1' } })
  assert.deepEqual(wireOf({ content: [], structuredContent: { value: [1, 2] }, _meta: { 'tent.wrapped': true } }), {
    ok: true,
    value: [1, 2],
  })
  const error = { code: 'taken', message: 'That title is taken.', fields: { title: 'That title is taken.' } }
  assert.deepEqual(wireOf({ content: [], isError: true, _meta: { 'tent.error': error } }), { ok: false, error })
  assert.equal(wireOf(undefined), undefined)
})

test('[25-9] in a frame a call and a read are calls of the tool through the chat app, a call that worked asks the screen again, another screen is opened in the browser, and with no connection nothing else is asked', async () => {
  const { reach, asked, worked, screens } = framed({
    connected: false,
    answer: (method) => (method === 'tools/call' ? { content: [], structuredContent: { id: 'o1' } } : {}),
  })
  assert.deepEqual(await reach.post('/_t/call/addOrder', { input: { title: 'Tea' }, version: 'v1' }), {
    ok: true,
    value: { id: 'o1' },
  })
  assert.deepEqual(asked[0], { method: 'tools/call', params: { name: 'addOrder', arguments: { title: 'Tea' } } })
  assert.deepEqual(worked, [1])
  await reach.post('/_t/read/openOrders', { input: {} })
  assert.deepEqual(worked, [1], 'a read asks for nothing again')
  assert.deepEqual(await reach.get?.('/_t/screen?path=%2Forders%3Fpage%3D2&version=v1'), {
    ok: true,
    value: { screen: 'ordersScreen' },
  })
  assert.deepEqual(screens, [{ page: 2 }])
  assert.equal(await reach.get?.('/_t/screen?path=%2Fabout&version=v1'), undefined)
  reach.go('/about')
  assert.deepEqual(asked.at(-1), { method: 'ui/open-link', params: { url: 'https://shop.example.com/about' } })
  const posted = Object(await reach.post('/_t/form/addOrder', {}))
  assert.equal(Object(posted.error).code, 'T0001')
  assert.equal(reach.socket, undefined, 'a frame that may connect nowhere opens no live connection')
})

test('[25-9] a press in a frame on a function that asks a person first has the chat app open the page where the person says yes', async () => {
  const page = 'https://shop.example.com/_t/ask?a=text'
  const error = { code: 'T7120', message: 'A person is asked first.', fields: { ask: 'text', page } }
  const { reach, asked, worked } = framed({
    connected: true,
    answer: (method) => (method === 'tools/call' ? { content: [], isError: true, _meta: { 'tent.error': error } } : {}),
  })
  assert.deepEqual(await reach.post('/_t/call/removeOrder', { input: { id: 'o1' } }), { ok: false, error })
  assert.deepEqual(asked.at(-1), { method: 'ui/open-link', params: { url: page } })
  assert.deepEqual(worked, [])
})

test('[25-9] in a frame a member of an agent is no tool: it is called at the app with the pass where the frame may connect, and is nothing where it may not', async (t) => {
  const heard: { url: string; authorization: string | null }[] = []
  const real = globalThis.fetch
  t.after(() => {
    globalThis.fetch = real
  })
  globalThis.fetch = async (url, how) => {
    heard.push({ url: String(url), authorization: new Headers(how?.headers).get('authorization') })
    return Response.json({ ok: true, value: [] })
  }
  const connected = framed({ connected: true, answer: () => ({}) })
  assert.deepEqual(await connected.reach.post('/_t/call/helper.stop', { input: {} }), { ok: true, value: [] })
  assert.deepEqual(heard, [{ url: 'https://shop.example.com/_t/call/helper.stop', authorization: 'Bearer a-pass' }])
  assert.deepEqual(connected.asked, [], 'the chat app is asked for no tool of it')
  const alone = framed({ connected: false, answer: () => ({}) })
  assert.equal(Object(Object(await alone.reach.post('/_t/call/helper.stop', { input: {} })).error).code, 'T0001')
  assert.deepEqual(alone.asked, [])
})

test('[25-9] the part that speaks to a chat app does nothing where no page holds it: it says nothing to the window around it', async () => {
  const posted: unknown[] = []
  const parent = { postMessage: (message: unknown) => void posted.push(message) }
  // A document that holds no drawing and no views, inside a frame: the part finds no page in it.
  Reflect.set(globalThis, 'document', { querySelector: () => null, getElementById: () => null })
  Reflect.set(globalThis, 'window', { parent, addEventListener: () => undefined })
  try {
    await import('../page/chat/chat.ts')
    await new Promise((done) => setTimeout(done, 10))
  } finally {
    Reflect.deleteProperty(globalThis, 'document')
    Reflect.deleteProperty(globalThis, 'window')
  }
  assert.deepEqual(posted, [])
})
