import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chatReach } from '../page/chat/reach.ts'
import { noEngine } from '../page/exported/exported.ts'
import { ownWords } from '../page/spoken.ts'

// The words of a language file of the project, over the framework's own.
const turkish = {
  ...ownWords,
  'tent.chat.noConnection': 'Sohbet uygulaması bu görünümün bağlanmasına izin vermiyor.',
  'tent.noEngine': 'Bu sayfanın arkasında bir motor yok.',
}

test('[32-9] the words that a person reads of a press in a chat frame, and on an exported page with no engine, are words of the page under keys of the framework, which a language file gives anew', async () => {
  const reach = chatReach({
    bridge: { request: async () => ({}), notify: () => undefined, heard: () => undefined },
    origin: 'https://shop.example.com',
    connected: false,
    pass: () => 'a-pass',
    path: () => '/orders',
    input: () => ({}),
    screen: async () => ({ ok: true, value: {} }),
    worked: () => undefined,
    words: turkish,
  })
  const refused = Object(await reach.post('/_t/call/helper.stop', { input: {} }))
  assert.equal(Object(refused.error).message, turkish['tent.chat.noConnection'])
  assert.equal(Object(Object(noEngine(turkish)).error).message, turkish['tent.noEngine'])
  assert.equal(Object(Object(noEngine(ownWords)).error).message, ownWords['tent.noEngine'])
})
